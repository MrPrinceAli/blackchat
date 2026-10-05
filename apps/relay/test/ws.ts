// Client WebSocket uji + pembuat room acak. Relay tidak bisa (dan tidak boleh) memverifikasi asal-usul
// roomId/memberKey/inboxRoomId, jadi test memakai byte acak; algoritma proof dicocokkan dengan libsodium di hash.test.ts.
import { SELF } from 'cloudflare:test';
import {
  AEAD_OVERHEAD,
  base64urlDecode,
  base64urlEncode,
  concatBytes,
  HEADER,
  hexEncode,
  LABELS,
  MESSAGE,
  parseServerFrame,
  SEALED_KEY_BYTES,
  utf8Encode,
  type RoomAuth,
  type RoomOp,
  type SendOp,
  type ServerFrame,
  type Ttl,
} from '@blackchat/protocol';
import { expectedProof } from '../src/proof.js';
import { ORIGIN, type TestAccount } from './helpers.js';

const random = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));
export const b64 = (n: number): string => base64urlEncode(random(n));

type ResultFrame = Extract<ServerFrame, { t: 'result' }>;

export class TestSocket {
  private readonly frames: ServerFrame[] = [];
  private readonly waiters: {
    match: (f: ServerFrame) => boolean;
    resolve: (f: ServerFrame) => void;
  }[] = [];
  private reqId = 0;
  readonly closed: Promise<{ code: number; reason: string }>;

  private constructor(readonly ws: WebSocket) {
    this.closed = new Promise((resolve) =>
      ws.addEventListener('close', (e) => resolve({ code: e.code, reason: e.reason })),
    );
    ws.addEventListener('message', (event) => {
      const parsed = parseServerFrame(String(event.data));
      if (!parsed.ok) throw new Error(`frame server tidak valid: ${parsed.error}`);
      const index = this.waiters.findIndex((w) => w.match(parsed.value));
      if (index >= 0) this.waiters.splice(index, 1)[0]!.resolve(parsed.value);
      else this.frames.push(parsed.value);
    });
  }

  /** Buka socket tanpa autentikasi. Melempar jika server tidak meng-upgrade. */
  static async open(userId: string, origin: string | null = ORIGIN): Promise<TestSocket> {
    const headers: Record<string, string> = { Upgrade: 'websocket' };
    if (origin) headers['Origin'] = origin;
    const response = await SELF.fetch(`https://relay.test/v1/ws/${userId}`, { headers });
    if (!response.webSocket)
      throw new Error(`upgrade gagal: ${response.status} ${await response.text()}`);
    response.webSocket.accept();
    return new TestSocket(response.webSocket);
  }

  /** Buka socket dan selesaikan challenge-response. */
  static async connect(account: TestAccount): Promise<TestSocket> {
    const socket = await TestSocket.open(account.userId);
    await socket.authenticate(account);
    return socket;
  }

  async authenticate(account: TestAccount, sign = account.sign): Promise<ServerFrame> {
    const challenge = await this.next((f) => f.t === 'challenge');
    if (challenge.t !== 'challenge') throw new Error('bukan challenge');
    const message = concatBytes(
      utf8Encode(LABELS.WS_AUTH),
      utf8Encode(account.userId),
      base64urlDecode(challenge.nonce),
    );
    this.sendRaw(JSON.stringify({ t: 'auth', sig: base64urlEncode(await sign(message)) }));
    return this.next((f) => f.t === 'ready');
  }

  sendRaw(data: string | ArrayBuffer): void {
    this.ws.send(data);
  }

  next(match: (f: ServerFrame) => boolean = () => true, timeoutMs = 3000): Promise<ServerFrame> {
    const index = this.frames.findIndex(match);
    if (index >= 0) return Promise.resolve(this.frames.splice(index, 1)[0]!);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout menunggu frame')), timeoutMs);
      this.waiters.push({
        match,
        resolve: (f) => {
          clearTimeout(timer);
          resolve(f);
        },
      });
    });
  }

  /** Kirim frame request (reqId diisi otomatis) dan tunggu result-nya. */
  async request(frame: { t: string; [key: string]: unknown }): Promise<ResultFrame> {
    const reqId = ++this.reqId;
    this.sendRaw(JSON.stringify({ ...frame, reqId }));
    return (await this.next((f) => f.t === 'result' && f.reqId === reqId)) as ResultFrame;
  }

  /** Frame yang sudah diterima tetapi belum diambil. */
  pending(): ServerFrame[] {
    return [...this.frames];
  }

  close(): void {
    this.ws.close(1000, 'selesai');
  }
}

export interface TestMember {
  memberTag: string;
  memberKey: Uint8Array;
  inboxRoomId: string;
}

export interface TestRoom {
  roomId: string;
  a: TestMember;
  b: TestMember;
}

const member = (): TestMember => ({
  memberTag: hexEncode(random(16)),
  memberKey: random(32),
  inboxRoomId: hexEncode(random(32)),
});

export function newRoom(): TestRoom {
  return { roomId: hexEncode(random(32)), a: member(), b: member() };
}

export function authFor(m: TestMember, op: RoomOp, opNonce = random(16)): RoomAuth {
  return {
    memberTag: m.memberTag,
    opNonce: base64urlEncode(opNonce),
    proof: base64urlEncode(expectedProof(m.memberKey, opNonce, op)),
  };
}

export const sealedHeader = (): string => b64(HEADER.SEALED_BYTES);

export function initFrame(room: TestRoom, me: 'a' | 'b', peer: TestAccount, ttl: Ttl = 5) {
  const self = room[me];
  const other = room[me === 'a' ? 'b' : 'a'];
  const op = {
    kind: 'init' as const,
    roomId: room.roomId,
    members: [
      { memberTag: room.a.memberTag, memberKey: base64urlEncode(room.a.memberKey) },
      { memberTag: room.b.memberTag, memberKey: base64urlEncode(room.b.memberKey) },
    ] as [{ memberTag: string; memberKey: string }, { memberTag: string; memberKey: string }],
    ttl,
  };
  return {
    t: 'room.init',
    op,
    auth: authFor(self, op),
    peerUserId: peer.userId,
    myInboxRoomId: self.inboxRoomId,
    peerInboxRoomId: other.inboxRoomId,
    sealedHeaderForSelf: sealedHeader(),
    sealedHeaderForPeer: sealedHeader(),
  };
}

export function sendOp(room: TestRoom, overrides: Partial<SendOp> = {}): SendOp {
  return {
    kind: 'send',
    roomId: room.roomId,
    msgId: b64(16),
    ttl: 5,
    body: b64(AEAD_OVERHEAD + MESSAGE.TEXT_PAD_BLOCK),
    keyForPeer: b64(SEALED_KEY_BYTES),
    keyForSelf: b64(SEALED_KEY_BYTES),
    chunks: 0,
    ...overrides,
  };
}

export function sendFrame(room: TestRoom, me: 'a' | 'b', peer: TestAccount, op = sendOp(room)) {
  const other = room[me === 'a' ? 'b' : 'a'];
  return {
    t: 'room.send',
    op,
    auth: authFor(room[me], op),
    peerUserId: peer.userId,
    peerInboxRoomId: other.inboxRoomId,
  };
}

export function syncFrame(room: TestRoom, me: 'a' | 'b', sinceSeq = 0) {
  const op = { kind: 'sync' as const, roomId: room.roomId, sinceSeq };
  return { t: 'room.sync', op, auth: authFor(room[me], op) };
}

export function openedFrame(room: TestRoom, me: 'a' | 'b', peer: TestAccount, msgIds: string[]) {
  const other = room[me === 'a' ? 'b' : 'a'];
  const op = { kind: 'opened' as const, roomId: room.roomId, msgIds };
  return {
    t: 'room.opened',
    op,
    auth: authFor(room[me], op),
    peerUserId: peer.userId,
    peerInboxRoomId: other.inboxRoomId,
  };
}

export function purgeFrame(room: TestRoom, me: 'a' | 'b') {
  const op = { kind: 'purge' as const, roomId: room.roomId };
  return { t: 'room.purge', op, auth: authFor(room[me], op) };
}

export function retractFrame(room: TestRoom, me: 'a' | 'b', peer: TestAccount, msgId: string) {
  const other = room[me === 'a' ? 'b' : 'a'];
  const op = { kind: 'retract' as const, roomId: room.roomId, msgId };
  return {
    t: 'room.retract',
    op,
    auth: authFor(room[me], op),
    peerUserId: peer.userId,
    peerInboxRoomId: other.inboxRoomId,
  };
}

export function ttlFrame(
  room: TestRoom,
  me: 'a' | 'b',
  peer: TestAccount,
  action: 'propose' | 'accept' | 'reject',
  ttl: Ttl,
) {
  const other = room[me === 'a' ? 'b' : 'a'];
  const op = { kind: 'ttl' as const, roomId: room.roomId, action, ttl };
  return {
    t: 'room.ttl',
    op,
    auth: authFor(room[me], op),
    peerUserId: peer.userId,
    peerInboxRoomId: other.inboxRoomId,
  };
}
