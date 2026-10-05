// Tipe semua data yang melintasi jaringan atau disegel/dienkripsi (PRD §4, §5.2, §6.5; D-001).
//
// Konvensi encoding nilai biner di wire:
// - base64url tanpa padding: kunci, tanda tangan, ciphertext, nonce, msgId, salt.
// - hex huruf kecil: roomId, inboxRoomId, memberTag (dipakai sebagai nama DO / primary key).
// - base32 Crockford huruf besar: userId (PRD §4.2).
// Ciphertext AEAD selalu nonce(24) || ciphertext || tag(16).

import type { ErrorCode, Ttl } from './constants.js';

/** String base64url tanpa padding. */
export type B64u = string;
/** String hex huruf kecil. */
export type Hex = string;
/** base32-crockford(BLAKE2b-160(edPk)), 32 karakter. */
export type UserId = string;

// ================================================================ Akun (HTTP, PRD §5.2)

export interface RegisterRequest {
  username: string;
  salt: B64u;
  authKey: B64u;
  edPk: B64u;
  xPk: B64u;
  xPkSig: B64u;
  vault: B64u;
  /** Ed25519(edSk, REQ_REGISTER || canonical(semua field selain sig)). */
  sig: B64u;
}

export interface RegisterResponse {
  userId: UserId;
  /** Nilai asli (hanya untuk pemilik akun). */
  expiresAt: number;
  /** Sisa umur akun menurut jam server (PRD §13.3). */
  remainingMs: number;
}

export interface SaltResponse {
  salt: B64u;
}

export interface LoginRequest {
  username: string;
  authKey: B64u;
}

export interface LoginResponse {
  userId: UserId;
  edPk: B64u;
  xPk: B64u;
  xPkSig: B64u;
  vault: B64u;
  contacts: B64u | null;
  expiresAt: number;
  remainingMs: number;
  seq: number;
}

export interface LookupResponse {
  userId: UserId;
  edPk: B64u;
  xPk: B64u;
  xPkSig: B64u;
  /** Dibulatkan ke bawah ke jam penuh (PRD §5.2). */
  expiresAt: number;
}

export interface ContactsRequest {
  userId: UserId;
  contacts: B64u;
  seq: number;
  sig: B64u;
}

export interface PasswordRequest {
  userId: UserId;
  salt: B64u;
  authKey: B64u;
  vault: B64u;
  seq: number;
  sig: B64u;
}

export interface DeleteAccountRequest {
  userId: UserId;
  seq: number;
  sig: B64u;
}

export interface ErrorResponse {
  error: ErrorCode;
}

// ================================================================ Room ops (diverifikasi RoomDO)

/** Kunci member yang didaftarkan saat init (PRD §4.6). */
export interface RoomMember {
  memberTag: Hex;
  memberKey: B64u;
}

/**
 * Bukti keanggotaan. proof = BLAKE2b-256(key=memberKey, PROOF || opNonce || opHash),
 * opHash = BLAKE2b-256(OP || canonical(op)). Hanya objek `op` yang dicakup, bukan field routing.
 */
export interface RoomAuth {
  memberTag: Hex;
  opNonce: B64u;
  proof: B64u;
}

export interface InitOp {
  kind: 'init';
  roomId: Hex;
  members: [RoomMember, RoomMember];
  ttl: Ttl;
}

export interface SyncOp {
  kind: 'sync';
  roomId: Hex;
  sinceSeq: number;
}

export interface SendOp {
  kind: 'send';
  roomId: Hex;
  msgId: B64u;
  ttl: Ttl;
  body: B64u;
  keyForPeer: B64u;
  keyForSelf: B64u;
  /** 0 untuk teks. Server tidak menyimpan jenis pesan (PRD §6.2). */
  chunks: number;
}

export interface PutChunkOp {
  kind: 'putChunk';
  roomId: Hex;
  msgId: B64u;
  idx: number;
}

export interface GetChunkOp {
  kind: 'getChunk';
  roomId: Hex;
  msgId: B64u;
  idx: number;
}

export interface OpenedOp {
  kind: 'opened';
  roomId: Hex;
  msgIds: B64u[];
}

export interface RetractOp {
  kind: 'retract';
  roomId: Hex;
  msgId: B64u;
}

export type TtlAction = 'propose' | 'accept' | 'reject';

export interface TtlOp {
  kind: 'ttl';
  roomId: Hex;
  action: TtlAction;
  /** Untuk accept/reject: nilai usulan yang dijawab, supaya tidak menyetujui usulan yang sudah berganti. */
  ttl: Ttl;
}

export interface PurgeOp {
  kind: 'purge';
  roomId: Hex;
}

export type RoomOp =
  InitOp | SyncOp | SendOp | PutChunkOp | GetChunkOp | OpenedOp | RetractOp | TtlOp | PurgeOp;

export type RoomOpKind = RoomOp['kind'];

// ================================================================ Frame WS client → InboxDO (PRD §6.5, D-001)

/** Field routing untuk notifikasi InboxDO → InboxDO lawan. Tidak pernah disimpan server. */
export interface PeerRoute {
  peerUserId: UserId;
  peerInboxRoomId: Hex;
}

export interface PingFrame {
  t: 'ping';
}

/** Jawaban challenge: Ed25519(edSk, WS_AUTH || userId || nonce). */
export interface AuthFrame {
  t: 'auth';
  sig: B64u;
}

export interface RoomsFrame {
  t: 'rooms';
  reqId: number;
}

export interface RoomsSetUnreadFrame {
  t: 'rooms.setUnread';
  reqId: number;
  inboxRoomId: Hex;
  n: number;
}

export interface RoomsForgetFrame {
  t: 'rooms.forget';
  reqId: number;
  inboxRoomId: Hex;
}

export interface RoomInitFrame extends PeerRoute {
  t: 'room.init';
  reqId: number;
  op: InitOp;
  auth: RoomAuth;
  myInboxRoomId: Hex;
  sealedHeaderForSelf: B64u;
  sealedHeaderForPeer: B64u;
}

export interface RoomSyncFrame {
  t: 'room.sync';
  reqId: number;
  op: SyncOp;
  auth: RoomAuth;
}

export interface RoomSendFrame extends PeerRoute {
  t: 'room.send';
  reqId: number;
  op: SendOp;
  auth: RoomAuth;
  /** Dikirim jika lawan mungkin sudah melupakan room (rooms.forget), agar room muncul lagi di daftarnya. */
  sealedHeaderForPeer?: B64u;
}

export interface RoomGetChunkFrame {
  t: 'room.getChunk';
  reqId: number;
  op: GetChunkOp;
  auth: RoomAuth;
}

export interface RoomOpenedFrame extends PeerRoute {
  t: 'room.opened';
  reqId: number;
  op: OpenedOp;
  auth: RoomAuth;
}

export interface RoomRetractFrame extends PeerRoute {
  t: 'room.retract';
  reqId: number;
  op: RetractOp;
  auth: RoomAuth;
}

export interface RoomTtlFrame extends PeerRoute {
  t: 'room.ttl';
  reqId: number;
  op: TtlOp;
  auth: RoomAuth;
}

/** Tidak membawa route: purge (hapus akun, blokir) tidak memberi tahu lawan. */
export interface RoomPurgeFrame {
  t: 'room.purge';
  reqId: number;
  op: PurgeOp;
  auth: RoomAuth;
}

export type ClientFrame =
  | PingFrame
  | AuthFrame
  | RoomsFrame
  | RoomsSetUnreadFrame
  | RoomsForgetFrame
  | RoomInitFrame
  | RoomSyncFrame
  | RoomSendFrame
  | RoomGetChunkFrame
  | RoomOpenedFrame
  | RoomRetractFrame
  | RoomTtlFrame
  | RoomPurgeFrame;

export type ClientFrameType = ClientFrame['t'];
/** Frame yang dibalas dengan `result`. */
export type RequestFrame = Exclude<ClientFrame, PingFrame | AuthFrame>;

/**
 * Header JSON di dalam frame biner chunk (PRD §13.2). Rute lawan ikut di setiap chunk agar relay bisa
 * memberi tahu lawan saat chunk terakhir masuk, tanpa menyimpan relasi antar-akun (D-018).
 */
export interface ChunkFrameHeader extends PeerRoute {
  reqId: number;
  op: PutChunkOp;
  auth: RoomAuth;
  sealedHeaderForPeer?: B64u;
}

export interface ChunkFrame {
  header: ChunkFrameHeader;
  data: Uint8Array;
}

// ================================================================ Frame WS InboxDO → client

export interface ChallengeFrame {
  t: 'challenge';
  nonce: B64u;
}

export interface ReadyFrame {
  t: 'ready';
  /** Sisa umur akun (PRD §13.3). */
  remainingMs: number;
}

export interface PongFrame {
  t: 'pong';
}

export interface ResultOkFrame {
  t: 'result';
  reqId: number;
  ok: true;
  data: unknown;
}

export interface ResultErrorFrame {
  t: 'result';
  reqId: number;
  ok: false;
  error: ErrorCode;
}

export type EventPayload =
  | { t: 'new'; seq: number }
  | { t: 'opened'; msgId: B64u; remainingMs: number }
  | { t: 'retracted'; msgId: B64u }
  | { t: 'ttl_proposed'; ttl: Ttl }
  | { t: 'ttl_changed'; ttl: Ttl }
  | { t: 'ttl_rejected'; ttl: Ttl };

export interface EventFrame {
  t: 'event';
  /** inboxRoomId milik penerima event (D-001). */
  inboxRoomId: Hex;
  payload: EventPayload;
}

export interface ExpiringFrame {
  t: 'expiring';
  inMs: number;
}

export type ServerFrame =
  | ChallengeFrame
  | ReadyFrame
  | PongFrame
  | ResultOkFrame
  | ResultErrorFrame
  | EventFrame
  | ExpiringFrame;

// ================================================================ Data `result` per frame

export interface RoomListItem {
  inboxRoomId: Hex;
  sealedHeader: B64u;
  /** Hanya petunjuk (PRD §6.1). */
  unread: number;
}

export interface RoomsResult {
  rooms: RoomListItem[];
}

export interface InitResult {
  /** ttl yang berlaku. Berbeda dari yang diminta jika lawan memulai bersamaan (PRD §6.2). */
  ttl: Ttl;
  created: boolean;
}

/** Pesan dalam hasil sync. `key` = keyForSelf jika mine, keyForPeer jika bukan. */
export interface SyncedMessage {
  msgId: B64u;
  seq: number;
  mine: boolean;
  ttl: Ttl;
  body: B64u;
  key: B64u;
  chunks: number;
  /** Ada jika pesan sudah dibuka (PRD §6.2). */
  remainingMs?: number;
}

export interface SyncResult {
  messages: SyncedMessage[];
  ttl: Ttl;
  /** Usulan timer yang menunggu jawaban (PRD §7.3). */
  pendingTtl?: { ttl: Ttl; mine: boolean };
  /** Sisa umur room. */
  expiresInMs: number;
}

export interface SendResult {
  seq: number;
}

export interface OpenedResult {
  opened: { msgId: B64u; remainingMs: number }[];
}

export interface GetChunkResult {
  data: B64u;
}

export interface PutChunkResult {
  complete: boolean;
}

export interface TtlResult {
  ttl: Ttl;
}

export type EmptyResult = Record<string, never>;

/** Pemetaan frame request → tipe data result-nya. */
export interface ResultDataMap {
  rooms: RoomsResult;
  'rooms.setUnread': EmptyResult;
  'rooms.forget': EmptyResult;
  'room.init': InitResult;
  'room.sync': SyncResult;
  'room.send': SendResult;
  'room.getChunk': GetChunkResult;
  'room.opened': OpenedResult;
  'room.retract': EmptyResult;
  'room.ttl': TtlResult;
  'room.purge': EmptyResult;
  'room.chunk': PutChunkResult;
}

// ================================================================ Plaintext yang disegel / dienkripsi client

/** Plaintext header room tersegel ke xPk pemilik inbox (PRD §6.1). Di-pad ke HEADER.PAD_BLOCK. */
export interface RoomHeader {
  v: 1;
  peerUserId: UserId;
  peerUsername: string;
  peerEdPk: B64u;
  peerXPk: B64u;
  peerXPkSig: B64u;
  /** Dibulatkan ke bawah ke jam penuh. */
  peerExpiresAt: number;
}

export interface InnerImage {
  w: number;
  h: number;
  mime: 'image/webp' | 'image/jpeg';
  chunks: number;
  bytes: number;
  /** BLAKE2b-256 byte gambar asli (sebelum padding). */
  hash: B64u;
}

/** Plaintext pesan (PRD §4.7). sig = Ed25519(edSk, INNER || canonical(Inner tanpa sig)). */
export interface Inner {
  v: 1;
  kind: 'text' | 'image';
  msgId: B64u;
  roomId: Hex;
  fromEdPk: B64u;
  ttl: Ttl;
  ts: number;
  text?: string;
  image?: InnerImage;
  sig: B64u;
}

export type UnsignedInner = Omit<Inner, 'sig'>;

/** Isi blob kontak (PRD §4.8). */
export interface Contact {
  userId: UserId;
  edPk: B64u;
  username: string;
  verified: boolean;
  blocked: boolean;
}
