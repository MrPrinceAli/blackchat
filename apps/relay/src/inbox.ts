// InboxDO (PRD §6.1): satu per akun, nama inbox:<userId>. Memegang satu socket aktif milik akun, daftar room
// (inboxRoomId milik pemilik, D-001, + header tersegel), dan meneruskan operasi room ke RoomDO.
// Penjaga akun mati: tidak ada penulisan storage sebelum akun terbukti hidup di D1.
import { DurableObject } from 'cloudflare:workers';
import {
  ACCOUNT,
  base64urlDecode,
  base64urlEncode,
  concatBytes,
  ERRORS,
  LABELS,
  LIMITS,
  parseClientFrame,
  SIZES,
  utf8Encode,
  vInboxRoomId,
  vSealedHeader,
  WS,
  type ClientFrame,
  type ErrorCode,
  type EventPayload,
  type RequestFrame,
  type RoomListItem,
  type ServerFrame,
} from '@blackchat/protocol';
import { liveAccountById, type AccountRow } from './account.js';
import { now } from './clock.js';
import type { Env } from './env.js';
import { HttpError } from './http.js';
import { enforceRate } from './limiter.js';
import type { RoomResult } from './room.js';
import { verifyEd25519 } from './verify.js';

/** Header internal dari Worker ke InboxDO. Selalu ditimpa Worker, jadi tidak bisa dipalsukan client. */
export const USER_HEADER = 'X-BC-User';

/** Disimpan sebagai attachment socket agar bertahan saat DO hibernasi. */
interface SocketState {
  state: 'challenge' | 'ready';
  userId: string;
  edPk: string;
  /** Nilai asli dari D1, hanya untuk perhitungan server. */
  expiresAt: number;
  nonce: string;
  connectedAt: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS rooms (
  room_id        TEXT PRIMARY KEY,
  sealed_header  BLOB NOT NULL,
  unread         INTEGER NOT NULL DEFAULT 0
);
`;

type Result<T> = RoomResult<T>;
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: ErrorCode): Result<T> => ({ ok: false, error });

const floorHour = (t: number): number => t - (t % ACCOUNT.EXPIRY_ROUNDING_MS);

export class InboxDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Heartbeat dijawab runtime tanpa membangunkan DO dari hibernasi (PRD §13.1).
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(WS.PING, WS.PONG));
  }

  // ---------------------------------------------------------------- storage

  private hasSchema(): boolean {
    return (
      this.ctx.storage.sql
        .exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'rooms'")
        .toArray().length > 0
    );
  }

  /** Dipanggil hanya setelah akun terbukti hidup. */
  private async prepare(account: AccountRow): Promise<void> {
    this.ctx.storage.sql.exec(SCHEMA);
    if ((await this.ctx.storage.getAlarm()) !== account.expires_at)
      await this.ctx.storage.setAlarm(account.expires_at);
  }

  private isInboxOf(userId: string): boolean {
    return this.ctx.id.equals(this.env.INBOX.idFromName(`inbox:${userId}`));
  }

  /** Akun hidup → prepare. Akun tidak ada/hangus → kosongkan storage (penjaga akun mati, PRD §6.1). */
  private async guard(userId: string): Promise<AccountRow | null> {
    const account = await liveAccountById(this.env, userId);
    if (!account) {
      await this.wipe(WS.CLOSE.EXPIRED, 'account gone');
      return null;
    }
    await this.prepare(account);
    return account;
  }

  private async wipe(code: number, reason: string): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) socket.close(code, reason);
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  // ---------------------------------------------------------------- koneksi

  override async fetch(request: Request): Promise<Response> {
    const userId = request.headers.get(USER_HEADER);
    if (!userId || !this.isInboxOf(userId))
      return Response.json({ error: ERRORS.INVALID }, { status: 400 });
    const account = await this.guard(userId);
    if (!account) return Response.json({ error: ERRORS.NOT_FOUND }, { status: 404 });

    // Socket yang belum lolos challenge dibatasi; yang tertua ditutup. Socket yang sudah ready tidak tersentuh,
    // sehingga orang lain tidak bisa memutus pemilik akun hanya dengan membuka koneksi.
    const pending = this.ctx
      .getWebSockets()
      .filter((s) => (s.deserializeAttachment() as SocketState | null)?.state === 'challenge')
      .sort(
        (a, b) =>
          (a.deserializeAttachment() as SocketState).connectedAt -
          (b.deserializeAttachment() as SocketState).connectedAt,
      );
    while (pending.length >= LIMITS.INBOX_MAX_PENDING_SOCKETS)
      pending.shift()?.close(WS.CLOSE.UNAUTHORIZED, 'too many pending');

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    const nonce = base64urlEncode(crypto.getRandomValues(new Uint8Array(SIZES.WS_CHALLENGE)));
    const state: SocketState = {
      state: 'challenge',
      userId,
      edPk: account.ed_pk,
      expiresAt: account.expires_at,
      nonce,
      connectedAt: now(),
    };
    server.serializeAttachment(state);
    this.send(server, { t: 'challenge', nonce });
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const state = ws.deserializeAttachment() as SocketState | null;
    if (!state) return ws.close(WS.CLOSE.PROTOCOL_ERROR, 'no state');
    if (now() >= state.expiresAt) {
      await this.wipe(WS.CLOSE.EXPIRED, 'account expired');
      return;
    }
    if (typeof message !== 'string') {
      // Frame biner (chunk gambar) ditangani di W10.
      return ws.close(
        state.state === 'ready' ? WS.CLOSE.PROTOCOL_ERROR : WS.CLOSE.UNAUTHORIZED,
        'binary',
      );
    }
    const parsed = parseClientFrame(message);
    if (!parsed.ok) return ws.close(WS.CLOSE.PROTOCOL_ERROR, 'invalid frame');
    const frame = parsed.value;

    if (state.state === 'challenge') return this.authenticate(ws, state, frame);
    if (frame.t === 'auth') return ws.close(WS.CLOSE.PROTOCOL_ERROR, 'already authenticated');
    if (frame.t === 'ping') return this.send(ws, { t: 'pong' });

    let result: Result<unknown>;
    try {
      result = await this.handle(state, frame);
    } catch (error) {
      result = fail(error instanceof HttpError ? error.code : ERRORS.INTERNAL);
    }
    this.send(
      ws,
      result.ok
        ? { t: 'result', reqId: frame.reqId, ok: true, data: result.value }
        : { t: 'result', reqId: frame.reqId, ok: false, error: result.error },
    );
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, 'closed');
    } catch {
      // Socket sudah tertutup.
    }
  }

  /** Challenge-response: Ed25519(edSk, "bc-ws-auth-v1" || userId || nonce) (PRD §6.1, D-008). */
  private async authenticate(ws: WebSocket, state: SocketState, frame: ClientFrame): Promise<void> {
    if (frame.t !== 'auth') return ws.close(WS.CLOSE.UNAUTHORIZED, 'auth required');
    const message = concatBytes(
      utf8Encode(LABELS.WS_AUTH),
      utf8Encode(state.userId),
      base64urlDecode(state.nonce),
    );
    if (!(await verifyEd25519(base64urlDecode(state.edPk), message, base64urlDecode(frame.sig)))) {
      return ws.close(WS.CLOSE.UNAUTHORIZED, 'bad signature');
    }
    // Satu socket aktif per akun: yang baru (dan sudah terautentikasi) menutup yang lain (PRD §6.1).
    for (const other of this.ctx.getWebSockets()) {
      if (other !== ws) other.close(WS.CLOSE.REPLACED, 'replaced');
    }
    ws.serializeAttachment({ ...state, state: 'ready' } satisfies SocketState);
    this.send(ws, { t: 'ready', remainingMs: state.expiresAt - now() });
  }

  private send(ws: WebSocket, frame: ServerFrame): void {
    try {
      ws.send(JSON.stringify(frame));
    } catch {
      // Socket tertutup di tengah jalan; client akan sinkron ulang.
    }
  }

  // ---------------------------------------------------------------- frame request

  private room(roomId: string) {
    return this.env.ROOM.get(this.env.ROOM.idFromName(`room:${roomId}`));
  }

  private peer(peerUserId: string) {
    return this.env.INBOX.get(this.env.INBOX.idFromName(`inbox:${peerUserId}`));
  }

  private roomCount(): number {
    return this.ctx.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM rooms').one().n;
  }

  private async handle(state: SocketState, frame: RequestFrame): Promise<Result<unknown>> {
    const sql = this.ctx.storage.sql;
    switch (frame.t) {
      case 'rooms': {
        const rooms = sql
          .exec<{ room_id: string; sealed_header: ArrayBuffer; unread: number }>(
            'SELECT room_id, sealed_header, unread FROM rooms',
          )
          .toArray()
          .map((r): RoomListItem => ({
            inboxRoomId: r.room_id,
            sealedHeader: base64urlEncode(new Uint8Array(r.sealed_header)),
            unread: r.unread,
          }));
        return ok({ rooms });
      }
      case 'rooms.setUnread':
        sql.exec('UPDATE rooms SET unread = ? WHERE room_id = ?', frame.n, frame.inboxRoomId);
        return ok({});
      case 'rooms.forget':
        sql.exec('DELETE FROM rooms WHERE room_id = ?', frame.inboxRoomId);
        return ok({});

      case 'room.init': {
        if (frame.peerUserId === state.userId) return fail(ERRORS.INVALID);
        const peer = await liveAccountById(this.env, frame.peerUserId);
        if (!peer) return fail(ERRORS.NOT_FOUND);
        // Room tidak pernah hidup lebih lama dari akun mana pun; dibulatkan ke jam (PRD §5.3).
        const expireAt = floorHour(Math.min(state.expiresAt, peer.expires_at));
        if (expireAt <= now()) return fail(ERRORS.EXPIRED);
        const exists =
          sql.exec('SELECT 1 FROM rooms WHERE room_id = ?', frame.myInboxRoomId).toArray().length >
          0;
        if (!exists && this.roomCount() >= LIMITS.INBOX_MAX_ROOMS)
          return fail(ERRORS.QUOTA_EXCEEDED);
        const result = await this.room(frame.op.roomId).init(frame.op, frame.auth, expireAt);
        if (!result.ok) return result;
        sql.exec(
          'INSERT INTO rooms (room_id, sealed_header, unread) VALUES (?, ?, 0) ON CONFLICT(room_id) DO NOTHING',
          frame.myInboxRoomId,
          base64urlDecode(frame.sealedHeaderForSelf),
        );
        await this.peer(frame.peerUserId).touch(
          frame.peerUserId,
          frame.peerInboxRoomId,
          frame.sealedHeaderForPeer,
          0,
        );
        return result;
      }

      case 'room.sync':
        return this.room(frame.op.roomId).sync(frame.op, frame.auth);

      case 'room.send': {
        await enforceRate(this.env, 'send', state.userId);
        if (!(await liveAccountById(this.env, frame.peerUserId))) return fail(ERRORS.NOT_FOUND);
        const result = await this.room(frame.op.roomId).send(frame.op, frame.auth);
        // Pesan gambar baru diberitahukan setelah semua chunk masuk (W10).
        if (result.ok && frame.op.chunks === 0) {
          const peer = this.peer(frame.peerUserId);
          await peer.touch(
            frame.peerUserId,
            frame.peerInboxRoomId,
            frame.sealedHeaderForPeer ?? null,
            1,
          );
          await peer.event(frame.peerUserId, frame.peerInboxRoomId, {
            t: 'new',
            seq: result.value.seq,
          });
        }
        return result;
      }

      case 'room.opened': {
        const result = await this.room(frame.op.roomId).opened(frame.op, frame.auth);
        if (result.ok) {
          const peer = this.peer(frame.peerUserId);
          for (const o of result.value.opened) {
            await peer.event(frame.peerUserId, frame.peerInboxRoomId, {
              t: 'opened',
              msgId: o.msgId,
              remainingMs: o.remainingMs,
            });
          }
        }
        return result;
      }

      case 'room.purge':
        return this.room(frame.op.roomId).purge(frame.op, frame.auth);

      case 'room.retract': {
        const result = await this.room(frame.op.roomId).retract(frame.op, frame.auth);
        if (result.ok) {
          await this.peer(frame.peerUserId).event(frame.peerUserId, frame.peerInboxRoomId, {
            t: 'retracted',
            msgId: frame.op.msgId,
          });
        }
        return result;
      }

      case 'room.ttl': {
        const result = await this.room(frame.op.roomId).ttl(frame.op, frame.auth);
        if (result.ok) {
          const { action, ttl } = frame.op;
          const payload: EventPayload =
            action === 'propose'
              ? { t: 'ttl_proposed', ttl }
              : action === 'accept'
                ? { t: 'ttl_changed', ttl }
                : { t: 'ttl_rejected', ttl };
          await this.peer(frame.peerUserId).event(frame.peerUserId, frame.peerInboxRoomId, payload);
        }
        return result;
      }

      // Diisi di W10 (chunk gambar).
      case 'room.getChunk':
        return fail(ERRORS.INVALID);
    }
  }

  // ---------------------------------------------------------------- RPC dari InboxDO lain

  /**
   * Tandai room di inbox ini: tambahkan entri baru (jika ada header) atau ubah penghitung belum dibuka.
   * Penghitung hanya petunjuk (PRD §6.1). Header entri yang sudah ada tidak pernah ditimpa.
   */
  async touch(
    userId: string,
    inboxRoomId: string,
    sealedHeader: string | null,
    unreadDelta: number,
  ): Promise<Result<Record<string, never>>> {
    if (!this.isInboxOf(userId) || !vInboxRoomId(inboxRoomId).ok) return fail(ERRORS.INVALID);
    if (sealedHeader !== null && !vSealedHeader(sealedHeader).ok) return fail(ERRORS.INVALID);
    if (!Number.isSafeInteger(unreadDelta) || unreadDelta < 0 || unreadDelta > 1)
      return fail(ERRORS.INVALID);
    if (!(await this.guard(userId))) return fail(ERRORS.NOT_FOUND);
    const sql = this.ctx.storage.sql;
    const exists =
      sql.exec('SELECT 1 FROM rooms WHERE room_id = ?', inboxRoomId).toArray().length > 0;
    if (exists) {
      sql.exec(
        'UPDATE rooms SET unread = MIN(unread + ?, ?) WHERE room_id = ?',
        unreadDelta,
        LIMITS.ROOM_MAX_PENDING_MESSAGES,
        inboxRoomId,
      );
    } else if (sealedHeader !== null && this.roomCount() < LIMITS.INBOX_MAX_ROOMS) {
      sql.exec(
        'INSERT INTO rooms (room_id, sealed_header, unread) VALUES (?, ?, ?)',
        inboxRoomId,
        base64urlDecode(sealedHeader),
        unreadDelta,
      );
    }
    return ok({});
  }

  /** Teruskan event ke socket pemilik jika online; dibuang jika offline. Tidak menulis storage. */
  async event(userId: string, inboxRoomId: string, payload: EventPayload): Promise<void> {
    if (!this.isInboxOf(userId) || !vInboxRoomId(inboxRoomId).ok) return;
    for (const ws of this.ctx.getWebSockets()) {
      if ((ws.deserializeAttachment() as SocketState | null)?.state === 'ready')
        this.send(ws, { t: 'event', inboxRoomId, payload });
    }
  }

  // ---------------------------------------------------------------- hangus & hapus

  /** Akun hangus (PRD §5.3): tutup socket, kosongkan storage. */
  override async alarm(): Promise<void> {
    await this.wipe(WS.CLOSE.EXPIRED, 'account expired');
  }

  /** Hapus akun sekarang (PRD §5.2). */
  async destroy(): Promise<void> {
    await this.wipe(1000, 'account deleted');
  }

  /** Hanya untuk test: apakah storage pernah disiapkan. */
  hasStorage(): boolean {
    return this.hasSchema();
  }
}
