// RoomDO (PRD §6.2): satu per pasangan, nama room:<roomId>. Tidak tahu siapa anggotanya: hanya menyimpan
// member_tag + member_key, dan setiap operasi dibuktikan dengan proof (PRD §4.6, D-009).
// Tabel baru dibuat oleh init; operasi lain pada room kosong tidak menulis apa pun.
import { DurableObject } from 'cloudflare:workers';
import {
  base64urlDecode,
  base64urlEncode,
  ERRORS,
  getChunkOp,
  IMAGE_CIPHER_CHUNK_BYTES,
  initOp,
  LIMITS,
  MESSAGE,
  openedOp,
  purgeOp,
  putChunkOp,
  retractOp,
  roomAuth as roomAuthValidator,
  sendOp,
  syncOp,
  ttlOp,
  type ErrorCode,
  type GetChunkOp,
  type GetChunkResult,
  type InitOp,
  type InitResult,
  type OpenedOp,
  type OpenedResult,
  type PurgeOp,
  type PutChunkOp,
  type RetractOp,
  type RoomAuth,
  type RoomOp,
  type SendOp,
  type SendResult,
  type SyncedMessage,
  type SyncOp,
  type SyncResult,
  type Ttl,
  type TtlOp,
  type TtlResult,
  type Validator,
} from '@blackchat/protocol';
import { now } from './clock.js';
import type { Env } from './env.js';
import { verifyRoomAuth } from './proof.js';

/** Hasil RPC: error dikembalikan sebagai nilai karena kelas error tidak melewati batas RPC. */
export type RoomResult<T> = { ok: true; value: T } | { ok: false; error: ErrorCode };

const ok = <T>(value: T): RoomResult<T> => ({ ok: true, value });
const fail = <T>(error: ErrorCode): RoomResult<T> => ({ ok: false, error });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS members (
  member_tag  TEXT PRIMARY KEY,
  member_key  BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  msg_id          TEXT PRIMARY KEY,
  from_tag        TEXT NOT NULL,
  ttl             INTEGER NOT NULL,
  body            BLOB NOT NULL,
  key_for_peer    BLOB NOT NULL,
  key_for_self    BLOB NOT NULL,
  chunks          INTEGER NOT NULL DEFAULT 0,
  uploaded        INTEGER NOT NULL DEFAULT 1,
  seq             INTEGER NOT NULL,
  opened_at       INTEGER,
  burn_at         INTEGER,
  upload_deadline INTEGER
);
CREATE TABLE IF NOT EXISTS chunks (
  msg_id  TEXT NOT NULL,
  idx     INTEGER NOT NULL,
  data    BLOB NOT NULL,
  PRIMARY KEY (msg_id, idx)
);
CREATE TABLE IF NOT EXISTS used_nonces (
  nonce TEXT PRIMARY KEY,
  at    INTEGER NOT NULL
);
`;

type Settings = {
  ttl: Ttl;
  expire_at: number;
  next_seq: number;
  /** Usulan timer yang menunggu jawaban (PRD §7.3). */
  pending: { ttl: Ttl; by: string } | null;
};

interface MessageRow extends Record<string, SqlStorageValue> {
  msg_id: string;
  from_tag: string;
  ttl: number;
  body: ArrayBuffer;
  key_for_peer: ArrayBuffer;
  key_for_self: ArrayBuffer;
  chunks: number;
  seq: number;
  burn_at: number | null;
}

export class RoomDO extends DurableObject<Env> {
  private get sql(): SqlStorage {
    return this.ctx.storage.sql;
  }

  // ---------------------------------------------------------------- util

  /** Room sudah dibuat? Hanya membaca sqlite_master, tidak menulis apa pun. */
  private exists(): boolean {
    return (
      this.sql
        .exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'members'")
        .toArray().length > 0
    );
  }

  /** op.roomId harus nama DO ini, supaya op untuk room lain tidak bisa dijalankan di sini. */
  private isThisRoom(roomId: string): boolean {
    return this.ctx.id.equals(this.env.ROOM.idFromName(`room:${roomId}`));
  }

  private settings(): Settings {
    const rows = this.sql.exec<{ k: string; v: string }>('SELECT k, v FROM settings').toArray();
    const map = new Map(rows.map((r) => [r.k, r.v]));
    const pendingTtl = map.get('pending_ttl');
    const pendingBy = map.get('pending_by');
    return {
      ttl: Number(map.get('ttl')) as Ttl,
      expire_at: Number(map.get('expire_at')),
      next_seq: Number(map.get('next_seq')),
      pending: pendingTtl && pendingBy ? { ttl: Number(pendingTtl) as Ttl, by: pendingBy } : null,
    };
  }

  private setSetting(key: string, value: string | number): void {
    this.sql.exec(
      'INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v',
      key,
      String(value),
    );
  }

  private memberKey(tag: string): Uint8Array | null {
    const row = this.sql
      .exec<{ member_key: ArrayBuffer }>('SELECT member_key FROM members WHERE member_tag = ?', tag)
      .toArray()[0];
    return row ? new Uint8Array(row.member_key) : null;
  }

  /**
   * Validasi ulang op & auth (pertahanan berlapis), cek room ada & tujuan benar, lalu verifikasi proof
   * dan nonce. Nonce dicatat hanya setelah proof valid.
   */
  private authorize<T extends RoomOp>(
    validator: Validator<T>,
    op: T,
    auth: RoomAuth,
  ): RoomResult<T> {
    const checkedOp = validator(op);
    const checkedAuth = roomAuthValidator(auth);
    if (!checkedOp.ok || !checkedAuth.ok) return fail(ERRORS.INVALID);
    if (!this.isThisRoom(checkedOp.value.roomId)) return fail(ERRORS.INVALID);
    if (!this.exists()) return fail(ERRORS.NOT_FOUND);
    if (now() >= this.settings().expire_at) return fail(ERRORS.NOT_FOUND);
    const key = this.memberKey(checkedAuth.value.memberTag);
    if (!key || !verifyRoomAuth(key, checkedOp.value, checkedAuth.value))
      return fail(ERRORS.BAD_PROOF);
    if (!this.useNonce(checkedAuth.value.opNonce)) return fail(ERRORS.REPLAY);
    return ok(checkedOp.value);
  }

  /** Anti-replay: tolak opNonce yang pernah dipakai dalam 10 menit terakhir (PRD §4.6). */
  private useNonce(nonce: string): boolean {
    const t = now();
    this.sql.exec('DELETE FROM used_nonces WHERE at <= ?', t - LIMITS.NONCE_WINDOW_MS);
    if (this.sql.exec('SELECT 1 FROM used_nonces WHERE nonce = ?', nonce).toArray().length > 0)
      return false;
    this.sql.exec('INSERT INTO used_nonces (nonce, at) VALUES (?, ?)', nonce, t);
    return true;
  }

  /** Hapus pesan beserta chunk-nya dalam satu transaksi (PRD §12 aturan 13). */
  private deleteMessages(where: string, ...bindings: SqlStorageValue[]): void {
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        `DELETE FROM chunks WHERE msg_id IN (SELECT msg_id FROM messages WHERE ${where})`,
        ...bindings,
      );
      this.sql.exec(`DELETE FROM messages WHERE ${where}`, ...bindings);
    });
  }

  /** Alarm = waktu paling awal dari burn_at, upload_deadline, dan expire_at (PRD §6.2). */
  private async scheduleAlarm(): Promise<void> {
    const { expire_at } = this.settings();
    const row = this.sql
      .exec<{ next: number | null }>(
        'SELECT MIN(t) AS next FROM (SELECT MIN(burn_at) AS t FROM messages UNION ALL SELECT MIN(upload_deadline) FROM messages)',
      )
      .one();
    const next = row.next === null ? expire_at : Math.min(row.next, expire_at);
    await this.ctx.storage.setAlarm(next);
  }

  // ---------------------------------------------------------------- operasi

  /**
   * Buat room atau bergabung dengan room yang sama (mulai bersamaan). expireAt dihitung InboxDO dari nilai asli D1:
   * floor_jam(min(expiresAt A, expiresAt B)) (PRD §5.3).
   */
  async init(op: InitOp, auth: RoomAuth, expireAt: number): Promise<RoomResult<InitResult>> {
    const checkedOp = initOp(op);
    const checkedAuth = roomAuthValidator(auth);
    if (!checkedOp.ok || !checkedAuth.ok) return fail(ERRORS.INVALID);
    if (!this.isThisRoom(checkedOp.value.roomId)) return fail(ERRORS.INVALID);
    if (!Number.isSafeInteger(expireAt) || expireAt % 3_600_000 !== 0 || expireAt <= now())
      return fail(ERRORS.INVALID);
    const { members, ttl } = checkedOp.value;
    const claimed = members.find((m) => m.memberTag === checkedAuth.value.memberTag);
    if (!claimed) return fail(ERRORS.BAD_PROOF);

    if (this.exists()) {
      // Room sudah ada: hanya sah jika anggotanya persis sama (PRD §6.2).
      const stored = this.sql
        .exec<{ member_tag: string; member_key: ArrayBuffer }>(
          'SELECT member_tag, member_key FROM members',
        )
        .toArray();
      const same =
        stored.length === 2 &&
        members.every((m) =>
          stored.some(
            (s) =>
              s.member_tag === m.memberTag &&
              base64urlEncode(new Uint8Array(s.member_key)) === m.memberKey,
          ),
        );
      if (!same) return fail(ERRORS.CONFLICT);
      const authorized = this.authorize(initOp, checkedOp.value, checkedAuth.value);
      if (!authorized.ok) return authorized;
      return ok({ ttl: this.settings().ttl, created: false });
    }

    // Room baru: proof diverifikasi dengan memberKey dari op sendiri sebelum apa pun ditulis.
    if (!verifyRoomAuth(base64urlDecode(claimed.memberKey), checkedOp.value, checkedAuth.value))
      return fail(ERRORS.BAD_PROOF);
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(SCHEMA);
      for (const m of members) {
        this.sql.exec(
          'INSERT INTO members (member_tag, member_key) VALUES (?, ?)',
          m.memberTag,
          base64urlDecode(m.memberKey),
        );
      }
      this.setSetting('ttl', ttl);
      this.setSetting('expire_at', expireAt);
      this.setSetting('next_seq', 1);
      this.sql.exec(
        'INSERT INTO used_nonces (nonce, at) VALUES (?, ?)',
        checkedAuth.value.opNonce,
        now(),
      );
    });
    await this.ctx.storage.setAlarm(expireAt);
    return ok({ ttl, created: true });
  }

  async send(op: SendOp, auth: RoomAuth): Promise<RoomResult<SendResult>> {
    const authorized = this.authorize(sendOp, op, auth);
    if (!authorized.ok) return authorized;
    const m = authorized.value;
    const pending = this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM messages').one().n;
    if (pending >= LIMITS.ROOM_MAX_PENDING_MESSAGES) return fail(ERRORS.ROOM_FULL);
    if (this.sql.exec('SELECT 1 FROM messages WHERE msg_id = ?', m.msgId).toArray().length > 0)
      return fail(ERRORS.CONFLICT);

    const settings = this.settings();
    const seq = settings.next_seq;
    // Timer record tidak boleh lebih lama dari timer room yang berlaku (penerima memakai min, PRD §7.3).
    const ttl = Math.min(m.ttl, settings.ttl);
    const uploaded = m.chunks === 0 ? 1 : 0;
    const deadline = uploaded ? null : now() + LIMITS.UPLOAD_DEADLINE_MS;
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        `INSERT INTO messages (msg_id, from_tag, ttl, body, key_for_peer, key_for_self, chunks, uploaded, seq, upload_deadline)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        m.msgId,
        auth.memberTag,
        ttl,
        base64urlDecode(m.body),
        base64urlDecode(m.keyForPeer),
        base64urlDecode(m.keyForSelf),
        m.chunks,
        uploaded,
        seq,
        deadline,
      );
      this.setSetting('next_seq', seq + 1);
    });
    await this.scheduleAlarm();
    return ok({ seq });
  }

  async sync(op: SyncOp, auth: RoomAuth): Promise<RoomResult<SyncResult>> {
    const authorized = this.authorize(syncOp, op, auth);
    if (!authorized.ok) return authorized;
    const t = now();
    const rows = this.sql
      .exec<MessageRow>(
        `SELECT msg_id, from_tag, ttl, body, key_for_peer, key_for_self, chunks, seq, burn_at FROM messages
         WHERE uploaded = 1 AND seq > ? AND (burn_at IS NULL OR burn_at > ?) ORDER BY seq`,
        authorized.value.sinceSeq,
        t,
      )
      .toArray();
    const messages = rows.map((r): SyncedMessage => {
      const mine = r.from_tag === auth.memberTag;
      const message: SyncedMessage = {
        msgId: r.msg_id,
        seq: r.seq,
        mine,
        ttl: r.ttl as Ttl,
        body: base64urlEncode(new Uint8Array(r.body)),
        key: base64urlEncode(new Uint8Array(mine ? r.key_for_self : r.key_for_peer)),
        chunks: r.chunks,
      };
      if (r.burn_at !== null) message.remainingMs = r.burn_at - t;
      return message;
    });
    const settings = this.settings();
    const result: SyncResult = {
      messages,
      ttl: settings.ttl,
      expiresInMs: Math.max(0, settings.expire_at - t),
    };
    if (settings.pending)
      result.pendingTtl = {
        ttl: settings.pending.ttl,
        mine: settings.pending.by === auth.memberTag,
      };
    return ok(result);
  }

  /** Hanya penerima. Timer mulai saat pertama dibuka dan tidak bisa dihentikan (PRD §6.2, §7.2). */
  async opened(op: OpenedOp, auth: RoomAuth): Promise<RoomResult<OpenedResult>> {
    const authorized = this.authorize(openedOp, op, auth);
    if (!authorized.ok) return authorized;
    const t = now();
    const opened: OpenedResult['opened'] = [];
    for (const msgId of authorized.value.msgIds) {
      const row = this.sql
        .exec<{ from_tag: string; ttl: number; uploaded: number; burn_at: number | null }>(
          'SELECT from_tag, ttl, uploaded, burn_at FROM messages WHERE msg_id = ?',
          msgId,
        )
        .toArray()[0];
      if (!row || row.uploaded !== 1 || (row.burn_at !== null && row.burn_at <= t))
        return fail(ERRORS.NOT_FOUND);
      if (row.from_tag === auth.memberTag) return fail(ERRORS.FORBIDDEN);
      let burnAt = row.burn_at;
      if (burnAt === null) {
        burnAt = t + row.ttl * 1000 + MESSAGE.BURN_GRACE_MS;
        this.sql.exec(
          'UPDATE messages SET opened_at = ?, burn_at = ? WHERE msg_id = ?',
          t,
          burnAt,
          msgId,
        );
      }
      opened.push({ msgId, remainingMs: burnAt - t });
    }
    await this.scheduleAlarm();
    return ok({ opened });
  }

  /**
   * Unggah satu chunk gambar (PRD §6.2): hanya pengirim pesan itu, ukuran tepat IMAGE_CIPHER_CHUNK_BYTES,
   * total chunk room maks 30 MB. Saat chunk terakhir masuk, pesan menjadi `uploaded=1` dan seq-nya dikembalikan
   * agar InboxDO memberi tahu lawan.
   */
  async putChunk(
    op: PutChunkOp,
    auth: RoomAuth,
    data: Uint8Array,
  ): Promise<RoomResult<{ complete: boolean; seq: number }>> {
    const authorized = this.authorize(putChunkOp, op, auth);
    if (!authorized.ok) return authorized;
    const { msgId, idx } = authorized.value;
    if (data.length !== IMAGE_CIPHER_CHUNK_BYTES) return fail(ERRORS.INVALID);
    const row = this.sql
      .exec<{ from_tag: string; chunks: number; uploaded: number; seq: number }>(
        'SELECT from_tag, chunks, uploaded, seq FROM messages WHERE msg_id = ?',
        msgId,
      )
      .toArray()[0];
    if (!row || row.uploaded === 1) return fail(ERRORS.NOT_FOUND);
    if (row.from_tag !== auth.memberTag) return fail(ERRORS.FORBIDDEN);
    if (idx >= row.chunks) return fail(ERRORS.INVALID);
    if (
      this.sql.exec('SELECT 1 FROM chunks WHERE msg_id = ? AND idx = ?', msgId, idx).toArray()
        .length > 0
    ) {
      return fail(ERRORS.CONFLICT);
    }
    const stored = this.sql
      .exec<{ n: number }>('SELECT COALESCE(SUM(LENGTH(data)), 0) AS n FROM chunks')
      .one().n;
    if (stored + data.length > LIMITS.ROOM_MAX_CHUNK_BYTES) return fail(ERRORS.ROOM_FULL);

    let complete = false;
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('INSERT INTO chunks (msg_id, idx, data) VALUES (?, ?, ?)', msgId, idx, data);
      const count = this.sql
        .exec<{ n: number }>('SELECT COUNT(*) AS n FROM chunks WHERE msg_id = ?', msgId)
        .one().n;
      if (count === row.chunks) {
        this.sql.exec(
          'UPDATE messages SET uploaded = 1, upload_deadline = NULL WHERE msg_id = ?',
          msgId,
        );
        complete = true;
      }
    });
    if (complete) await this.scheduleAlarm();
    return ok({ complete, seq: row.seq });
  }

  /** Unduh satu chunk (PRD §6.2): hanya untuk pesan yang sudah lengkap dan belum melebur. */
  async getChunk(op: GetChunkOp, auth: RoomAuth): Promise<RoomResult<GetChunkResult>> {
    const authorized = this.authorize(getChunkOp, op, auth);
    if (!authorized.ok) return authorized;
    const { msgId, idx } = authorized.value;
    const row = this.sql
      .exec<{ uploaded: number; burn_at: number | null }>(
        'SELECT uploaded, burn_at FROM messages WHERE msg_id = ?',
        msgId,
      )
      .toArray()[0];
    if (!row || row.uploaded !== 1 || (row.burn_at !== null && row.burn_at <= now()))
      return fail(ERRORS.NOT_FOUND);
    const chunk = this.sql
      .exec<{ data: ArrayBuffer }>(
        'SELECT data FROM chunks WHERE msg_id = ? AND idx = ?',
        msgId,
        idx,
      )
      .toArray()[0];
    if (!chunk) return fail(ERRORS.NOT_FOUND);
    return ok({ data: base64urlEncode(new Uint8Array(chunk.data)) });
  }

  /**
   * Hanya pengirim: hapus pesan + chunk dalam satu transaksi (PRD §6.2, §7.4). Berlaku selama pesan belum
   * melebur, termasuk yang sudah dibuka atau masih diunggah.
   */
  async retract(op: RetractOp, auth: RoomAuth): Promise<RoomResult<Record<string, never>>> {
    const authorized = this.authorize(retractOp, op, auth);
    if (!authorized.ok) return authorized;
    const row = this.sql
      .exec<{ from_tag: string; burn_at: number | null }>(
        'SELECT from_tag, burn_at FROM messages WHERE msg_id = ?',
        authorized.value.msgId,
      )
      .toArray()[0];
    if (!row || (row.burn_at !== null && row.burn_at <= now())) return fail(ERRORS.NOT_FOUND);
    if (row.from_tag !== auth.memberTag) return fail(ERRORS.FORBIDDEN);
    this.deleteMessages('msg_id = ?', authorized.value.msgId);
    await this.scheduleAlarm();
    return ok({});
  }

  /**
   * Kesepakatan timer (PRD §7.3): usulan dari satu anggota, jawaban hanya dari anggota lain. Jawaban harus menyebut
   * nilai usulan yang dijawab, supaya tidak menyetujui usulan yang sudah berganti (D-009).
   */
  async ttl(op: TtlOp, auth: RoomAuth): Promise<RoomResult<TtlResult>> {
    const authorized = this.authorize(ttlOp, op, auth);
    if (!authorized.ok) return authorized;
    const { action, ttl } = authorized.value;
    const settings = this.settings();
    if (action === 'propose') {
      if (ttl === settings.ttl) return fail(ERRORS.INVALID);
      this.setSetting('pending_ttl', ttl);
      this.setSetting('pending_by', auth.memberTag);
      return ok({ ttl: settings.ttl });
    }
    const pending = settings.pending;
    if (!pending || pending.ttl !== ttl) return fail(ERRORS.CONFLICT);
    if (pending.by === auth.memberTag) return fail(ERRORS.FORBIDDEN);
    this.ctx.storage.transactionSync(() => {
      if (action === 'accept') this.setSetting('ttl', ttl);
      this.sql.exec("DELETE FROM settings WHERE k IN ('pending_ttl', 'pending_by')");
    });
    return ok({ ttl: action === 'accept' ? ttl : settings.ttl });
  }

  /** Anggota mana pun: hapus semua pesan & chunk (hapus akun, blokir; PRD §6.2). */
  async purge(op: PurgeOp, auth: RoomAuth): Promise<RoomResult<Record<string, never>>> {
    const authorized = this.authorize(purgeOp, op, auth);
    if (!authorized.ok) return authorized;
    this.deleteMessages('1 = 1');
    await this.scheduleAlarm();
    return ok({});
  }

  /** PRD §6.2 langkah 1–5. */
  override async alarm(): Promise<void> {
    if (!this.exists()) return;
    const t = now();
    const { expire_at } = this.settings();
    if (t >= expire_at) {
      await this.ctx.storage.deleteAll();
      return;
    }
    this.deleteMessages('burn_at IS NOT NULL AND burn_at <= ?', t);
    this.deleteMessages('uploaded = 0 AND upload_deadline IS NOT NULL AND upload_deadline <= ?', t);
    this.sql.exec('DELETE FROM used_nonces WHERE at <= ?', t - LIMITS.NONCE_WINDOW_MS);
    await this.scheduleAlarm();
  }
}
