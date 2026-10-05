// Validator semua input jaringan dan plaintext yang didekripsi (PRD §12 aturan 10).
// Setiap validator membangun objek baru yang hanya berisi field yang dikenal, dan menolak:
// tipe salah, field hilang, field asing, panjang/ukuran di luar batas, alfabet salah, encoding non-kanonik.

import {
  ACCOUNT,
  AEAD_OVERHEAD,
  CONTACTS,
  ERRORS,
  HEADER,
  IMAGE,
  IMAGE_MAX_CHUNKS,
  LIMITS,
  MESSAGE,
  REQ_ID_MAX,
  SEALED_KEY_BYTES,
  SIZES,
  VAULT_BYTES,
  type ErrorCode,
  type Ttl,
} from './constants.js';
import { base64urlDecode, base64urlDecodedLength, EncodingError, utf8Encode } from './encoding.js';
import type {
  AuthFrame,
  ChallengeFrame,
  ClientFrame,
  Contact,
  ContactsRequest,
  DeleteAccountRequest,
  EventFrame,
  EventPayload,
  ExpiringFrame,
  GetChunkOp,
  GetChunkResult,
  InitOp,
  InitResult,
  Inner,
  InnerImage,
  LoginRequest,
  LoginResponse,
  LookupResponse,
  OpenedOp,
  OpenedResult,
  PasswordRequest,
  PingFrame,
  PongFrame,
  PurgeOp,
  PutChunkOp,
  PutChunkResult,
  ReadyFrame,
  RegisterRequest,
  RegisterResponse,
  ResultDataMap,
  ResultErrorFrame,
  ResultOkFrame,
  RetractOp,
  RoomAuth,
  RoomGetChunkFrame,
  RoomHeader,
  RoomInitFrame,
  RoomListItem,
  RoomMember,
  RoomOpenedFrame,
  RoomPurgeFrame,
  RoomRetractFrame,
  RoomsForgetFrame,
  RoomsFrame,
  RoomSendFrame,
  RoomsResult,
  RoomsSetUnreadFrame,
  RoomSyncFrame,
  RoomTtlFrame,
  SaltResponse,
  SendOp,
  SendResult,
  ServerFrame,
  ChunkFrameHeader,
  SyncedMessage,
  SyncOp,
  SyncResult,
  TtlOp,
  TtlResult,
  EmptyResult,
} from './types.js';

// ================================================================ inti

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export type Validator<T> = (input: unknown, path?: string) => Result<T>;

type Failure = { ok: false; error: string };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (path: string, message: string): Failure => ({
  ok: false,
  error: `${path || '$'}: ${message}`,
});

function isPlainObject(input: unknown): input is Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return false;
  const proto: unknown = Object.getPrototypeOf(input);
  return proto === Object.prototype || proto === null;
}

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** Jumlah code point (bukan code unit UTF-16). */
export function codePointLength(text: string): number {
  let n = 0;
  for (const _ of text) n++;
  return n;
}

// ================================================================ combinator

type Shape = Record<string, Validator<unknown>>;
type Infer<S extends Shape> = { [K in keyof S]: S[K] extends Validator<infer T> ? T : never };
type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** Objek dengan field wajib dan opsional. Field asing ditolak. */
export function obj<R extends Shape, O extends Shape = Record<never, never>>(
  required: R,
  optional?: O,
): Validator<Simplify<Infer<R> & Partial<Infer<O>>>> {
  return (input, path = '') => {
    if (!isPlainObject(input)) return fail(path, 'harus objek');
    for (const key of Object.keys(input)) {
      // Object.hasOwn, bukan `in`: `"__proto__" in {}` bernilai true lewat prototype chain.
      if (!Object.hasOwn(required, key) && !(optional && Object.hasOwn(optional, key))) {
        return fail(`${path}.${key}`, 'field tidak dikenal');
      }
    }
    const out: Record<string, unknown> = {};
    for (const [key, validate] of Object.entries(required)) {
      if (!Object.hasOwn(input, key)) return fail(`${path}.${key}`, 'wajib ada');
      const r = validate(input[key], `${path}.${key}`);
      if (!r.ok) return r;
      out[key] = r.value;
    }
    if (optional) {
      for (const [key, validate] of Object.entries(optional)) {
        if (!Object.hasOwn(input, key)) continue;
        const r = validate(input[key], `${path}.${key}`);
        if (!r.ok) return r;
        out[key] = r.value;
      }
    }
    return ok(out as Simplify<Infer<R> & Partial<Infer<O>>>);
  };
}

export function arr<T>(item: Validator<T>, min: number, max: number): Validator<T[]> {
  return (input, path = '') => {
    if (!Array.isArray(input)) return fail(path, 'harus array');
    if (input.length < min || input.length > max) {
      return fail(path, `panjang array harus ${min}–${max}`);
    }
    const out: T[] = [];
    for (let i = 0; i < input.length; i++) {
      const r = item(input[i], `${path}[${i}]`);
      if (!r.ok) return r;
      out.push(r.value);
    }
    return ok(out);
  };
}

export function refine<T>(
  validate: Validator<T>,
  predicate: (value: T) => boolean,
  message: string,
): Validator<T> {
  return (input, path = '') => {
    const r = validate(input, path);
    if (!r.ok) return r;
    return predicate(r.value) ? r : fail(path, message);
  };
}

export function literal<const T extends string | number | boolean>(expected: T): Validator<T> {
  return (input, path = '') =>
    input === expected ? ok(expected) : fail(path, `harus ${JSON.stringify(expected)}`);
}

export function oneOf<const T extends string | number>(options: readonly T[]): Validator<T> {
  return (input, path = '') =>
    options.includes(input as T)
      ? ok(input as T)
      : fail(path, `harus salah satu dari ${options.join(', ')}`);
}

export const bool: Validator<boolean> = (input, path = '') =>
  typeof input === 'boolean' ? ok(input) : fail(path, 'harus boolean');

export function int(min: number, max: number): Validator<number> {
  return (input, path = '') => {
    if (typeof input !== 'number' || !Number.isSafeInteger(input) || Object.is(input, -0)) {
      return fail(path, 'harus bilangan bulat');
    }
    if (input < min || input > max) return fail(path, `harus ${min}–${max}`);
    return ok(input);
  };
}

/** String UTF-16 well-formed dengan panjang dalam code point. */
export function text(minCodePoints: number, maxCodePoints: number): Validator<string> {
  return (input, path = '') => {
    if (typeof input !== 'string') return fail(path, 'harus string');
    if (LONE_SURROGATE.test(input)) return fail(path, 'surrogate tunggal tidak diizinkan');
    const n = codePointLength(input);
    if (n < minCodePoints || n > maxCodePoints) {
      return fail(path, `panjang harus ${minCodePoints}–${maxCodePoints} karakter`);
    }
    return ok(input);
  };
}

export function pattern(re: RegExp, message: string): Validator<string> {
  return (input, path = '') =>
    typeof input === 'string' && re.test(input) ? ok(input) : fail(path, message);
}

/** base64url kanonik yang panjang hasil decode-nya memenuhi `accept`. */
export function b64u(accept: (byteLength: number) => boolean, describe: string): Validator<string> {
  return (input, path = '') => {
    if (typeof input !== 'string') return fail(path, 'harus string base64url');
    const length = base64urlDecodedLength(input.length);
    if (length < 0 || !accept(length)) return fail(path, `ukuran harus ${describe}`);
    try {
      base64urlDecode(input);
    } catch (e) {
      return fail(path, e instanceof EncodingError ? e.message : 'base64url tidak valid');
    }
    return ok(input);
  };
}

export const b64uExact = (bytes: number): Validator<string> =>
  b64u((n) => n === bytes, `${bytes} byte`);

/** Ciphertext AEAD dengan plaintext ber-padding: AEAD_OVERHEAD + k × block, 1 ≤ k ≤ maxBlocks. */
export const b64uPadded = (block: number, maxBlocks: number): Validator<string> =>
  b64u((n) => {
    const body = n - AEAD_OVERHEAD;
    return body > 0 && body % block === 0 && body / block <= maxBlocks;
  }, `${AEAD_OVERHEAD} + k×${block} byte (k ≤ ${maxBlocks})`);

export const hexExact = (bytes: number): Validator<string> =>
  pattern(new RegExp(`^[0-9a-f]{${bytes * 2}}$`), `harus hex huruf kecil ${bytes} byte`);

// ================================================================ nilai dasar

export const vUsername = pattern(ACCOUNT.USERNAME_PATTERN, 'username harus ^[a-z0-9_]{3,20}$');
export const vUserId = pattern(
  /^[0-9A-HJKMNP-TV-Z]{32}$/,
  'userId harus 32 karakter base32 Crockford huruf besar',
);
export const vRoomId = hexExact(SIZES.ROOM_ID);
export const vInboxRoomId = hexExact(SIZES.INBOX_ROOM_ID);
export const vMemberTag = hexExact(SIZES.MEMBER_TAG);
export const vMemberKey = b64uExact(SIZES.MEMBER_KEY);
export const vEdPk = b64uExact(SIZES.ED_PK);
export const vXPk = b64uExact(SIZES.X_PK);
export const vSig = b64uExact(SIZES.ED_SIG);
export const vSalt = b64uExact(16);
export const vAuthKey = b64uExact(SIZES.AUTH_KEY);
export const vVault = b64uExact(VAULT_BYTES);
export const vContactsBlob = b64uPadded(CONTACTS.PAD_BLOCK, CONTACTS.MAX_PAD_BLOCKS);
export const vMsgId = b64uExact(SIZES.MSG_ID);
export const vOpNonce = b64uExact(SIZES.OP_NONCE);
export const vProof = b64uExact(SIZES.PROOF);
export const vSealedKey = b64uExact(SEALED_KEY_BYTES);
export const vSealedHeader = b64uExact(HEADER.SEALED_BYTES);
export const vBody = b64uPadded(MESSAGE.TEXT_PAD_BLOCK, MESSAGE.BODY_MAX_PAD_BLOCKS);
export const vChallengeNonce = b64uExact(SIZES.WS_CHALLENGE);
export const vTtl: Validator<Ttl> = oneOf(MESSAGE.TTL_OPTIONS);
export const vReqId = int(1, REQ_ID_MAX);
export const vSeq = int(0, Number.MAX_SAFE_INTEGER);
export const vTimestamp = int(0, Number.MAX_SAFE_INTEGER);
export const vDurationMs = int(0, Number.MAX_SAFE_INTEGER);
export const vChunkCount = int(0, IMAGE_MAX_CHUNKS);
export const vChunkIdx = int(0, IMAGE_MAX_CHUNKS - 1);
export const vErrorCode: Validator<ErrorCode> = oneOf(Object.values(ERRORS));
/** expiresAt publik selalu kelipatan jam penuh (PRD §5.2). */
export const vRoundedExpiry = refine(
  vTimestamp,
  (t) => t % ACCOUNT.EXPIRY_ROUNDING_MS === 0,
  'harus kelipatan 1 jam',
);

// ================================================================ akun (HTTP)

export const registerRequest: Validator<RegisterRequest> = obj({
  username: vUsername,
  salt: vSalt,
  authKey: vAuthKey,
  edPk: vEdPk,
  xPk: vXPk,
  xPkSig: vSig,
  vault: vVault,
  sig: vSig,
});

export const registerResponse: Validator<RegisterResponse> = obj({
  userId: vUserId,
  expiresAt: vTimestamp,
  remainingMs: vDurationMs,
});

export const saltResponse: Validator<SaltResponse> = obj({ salt: vSalt });

export const loginRequest: Validator<LoginRequest> = obj({
  username: vUsername,
  authKey: vAuthKey,
});

const nullable =
  <T>(validate: Validator<T>): Validator<T | null> =>
  (input, path = '') =>
    input === null ? ok(null) : validate(input, path);

export const loginResponse: Validator<LoginResponse> = obj({
  userId: vUserId,
  edPk: vEdPk,
  xPk: vXPk,
  xPkSig: vSig,
  vault: vVault,
  contacts: nullable(vContactsBlob),
  expiresAt: vTimestamp,
  remainingMs: vDurationMs,
  seq: vSeq,
});

export const lookupResponse: Validator<LookupResponse> = obj({
  userId: vUserId,
  edPk: vEdPk,
  xPk: vXPk,
  xPkSig: vSig,
  expiresAt: vRoundedExpiry,
});

export const contactsRequest: Validator<ContactsRequest> = obj({
  userId: vUserId,
  contacts: vContactsBlob,
  seq: vSeq,
  sig: vSig,
});

export const passwordRequest: Validator<PasswordRequest> = obj({
  userId: vUserId,
  salt: vSalt,
  authKey: vAuthKey,
  vault: vVault,
  seq: vSeq,
  sig: vSig,
});

export const deleteAccountRequest: Validator<DeleteAccountRequest> = obj({
  userId: vUserId,
  seq: vSeq,
  sig: vSig,
});

export const errorResponse = obj({ error: vErrorCode });

/** Respons `{}` dari update bertanda tangan (contacts, password, DELETE; D-012). */
export const emptyResponse: Validator<Record<string, never>> = (input, path = '') =>
  isPlainObject(input) && Object.keys(input).length === 0
    ? ok({})
    : fail(path, 'harus objek kosong');

// ================================================================ room ops

export const roomMember: Validator<RoomMember> = obj({
  memberTag: vMemberTag,
  memberKey: vMemberKey,
});

export const roomAuth: Validator<RoomAuth> = obj({
  memberTag: vMemberTag,
  opNonce: vOpNonce,
  proof: vProof,
});

const vMembers: Validator<[RoomMember, RoomMember]> = refine(
  arr(roomMember, 2, 2),
  (m) => m[0]!.memberTag !== m[1]!.memberTag,
  'memberTag kedua anggota harus berbeda',
) as Validator<[RoomMember, RoomMember]>;

export const initOp: Validator<InitOp> = obj({
  kind: literal('init'),
  roomId: vRoomId,
  members: vMembers,
  ttl: vTtl,
});

export const syncOp: Validator<SyncOp> = obj({
  kind: literal('sync'),
  roomId: vRoomId,
  sinceSeq: vSeq,
});

export const sendOp: Validator<SendOp> = obj({
  kind: literal('send'),
  roomId: vRoomId,
  msgId: vMsgId,
  ttl: vTtl,
  body: vBody,
  keyForPeer: vSealedKey,
  keyForSelf: vSealedKey,
  chunks: vChunkCount,
});

export const putChunkOp: Validator<PutChunkOp> = obj({
  kind: literal('putChunk'),
  roomId: vRoomId,
  msgId: vMsgId,
  idx: vChunkIdx,
});

export const getChunkOp: Validator<GetChunkOp> = obj({
  kind: literal('getChunk'),
  roomId: vRoomId,
  msgId: vMsgId,
  idx: vChunkIdx,
});

export const openedOp: Validator<OpenedOp> = obj({
  kind: literal('opened'),
  roomId: vRoomId,
  msgIds: refine(
    arr(vMsgId, 1, MESSAGE.OPENED_MAX_IDS),
    (ids) => new Set(ids).size === ids.length,
    'msgId tidak boleh berulang',
  ),
});

export const retractOp: Validator<RetractOp> = obj({
  kind: literal('retract'),
  roomId: vRoomId,
  msgId: vMsgId,
});

export const ttlOp: Validator<TtlOp> = obj({
  kind: literal('ttl'),
  roomId: vRoomId,
  action: oneOf(['propose', 'accept', 'reject'] as const),
  ttl: vTtl,
});

export const purgeOp: Validator<PurgeOp> = obj({ kind: literal('purge'), roomId: vRoomId });

// ================================================================ frame client → server

const route = { peerUserId: vUserId, peerInboxRoomId: vInboxRoomId };

export const pingFrame: Validator<PingFrame> = obj({ t: literal('ping') });
export const authFrame: Validator<AuthFrame> = obj({ t: literal('auth'), sig: vSig });
export const roomsFrame: Validator<RoomsFrame> = obj({ t: literal('rooms'), reqId: vReqId });

export const roomsSetUnreadFrame: Validator<RoomsSetUnreadFrame> = obj({
  t: literal('rooms.setUnread'),
  reqId: vReqId,
  inboxRoomId: vInboxRoomId,
  n: int(0, LIMITS.ROOM_MAX_PENDING_MESSAGES),
});

export const roomsForgetFrame: Validator<RoomsForgetFrame> = obj({
  t: literal('rooms.forget'),
  reqId: vReqId,
  inboxRoomId: vInboxRoomId,
});

export const roomInitFrame: Validator<RoomInitFrame> = refine(
  obj({
    t: literal('room.init'),
    reqId: vReqId,
    op: initOp,
    auth: roomAuth,
    ...route,
    myInboxRoomId: vInboxRoomId,
    sealedHeaderForSelf: vSealedHeader,
    sealedHeaderForPeer: vSealedHeader,
  }),
  (f) => f.myInboxRoomId !== f.peerInboxRoomId,
  'inboxRoomId sendiri dan lawan harus berbeda',
);

export const roomSyncFrame: Validator<RoomSyncFrame> = obj({
  t: literal('room.sync'),
  reqId: vReqId,
  op: syncOp,
  auth: roomAuth,
});

export const roomSendFrame: Validator<RoomSendFrame> = obj(
  { t: literal('room.send'), reqId: vReqId, op: sendOp, auth: roomAuth, ...route },
  { sealedHeaderForPeer: vSealedHeader },
);

export const roomGetChunkFrame: Validator<RoomGetChunkFrame> = obj({
  t: literal('room.getChunk'),
  reqId: vReqId,
  op: getChunkOp,
  auth: roomAuth,
});

export const roomOpenedFrame: Validator<RoomOpenedFrame> = obj({
  t: literal('room.opened'),
  reqId: vReqId,
  op: openedOp,
  auth: roomAuth,
  ...route,
});

export const roomRetractFrame: Validator<RoomRetractFrame> = obj({
  t: literal('room.retract'),
  reqId: vReqId,
  op: retractOp,
  auth: roomAuth,
  ...route,
});

export const roomTtlFrame: Validator<RoomTtlFrame> = obj({
  t: literal('room.ttl'),
  reqId: vReqId,
  op: ttlOp,
  auth: roomAuth,
  ...route,
});

export const roomPurgeFrame: Validator<RoomPurgeFrame> = obj({
  t: literal('room.purge'),
  reqId: vReqId,
  op: purgeOp,
  auth: roomAuth,
});

export const chunkFrameHeader: Validator<ChunkFrameHeader> = obj({
  reqId: vReqId,
  op: putChunkOp,
  auth: roomAuth,
});

const CLIENT_FRAMES: { [K in ClientFrame['t']]: Validator<Extract<ClientFrame, { t: K }>> } = {
  ping: pingFrame,
  auth: authFrame,
  rooms: roomsFrame,
  'rooms.setUnread': roomsSetUnreadFrame,
  'rooms.forget': roomsForgetFrame,
  'room.init': roomInitFrame,
  'room.sync': roomSyncFrame,
  'room.send': roomSendFrame,
  'room.getChunk': roomGetChunkFrame,
  'room.opened': roomOpenedFrame,
  'room.retract': roomRetractFrame,
  'room.ttl': roomTtlFrame,
  'room.purge': roomPurgeFrame,
};

export const clientFrame: Validator<ClientFrame> = discriminated(CLIENT_FRAMES);

// ================================================================ frame server → client

export const challengeFrame: Validator<ChallengeFrame> = obj({
  t: literal('challenge'),
  nonce: vChallengeNonce,
});
export const readyFrame: Validator<ReadyFrame> = obj({
  t: literal('ready'),
  remainingMs: vDurationMs,
});
export const pongFrame: Validator<PongFrame> = obj({ t: literal('pong') });
export const expiringFrame: Validator<ExpiringFrame> = obj({
  t: literal('expiring'),
  inMs: vDurationMs,
});

const resultOkFrame: Validator<ResultOkFrame> = (input, path = '') => {
  const r = obj({ t: literal('result'), reqId: vReqId, ok: literal(true), data: any })(input, path);
  return r.ok ? ok(r.value as ResultOkFrame) : r;
};
const resultErrorFrame: Validator<ResultErrorFrame> = obj({
  t: literal('result'),
  reqId: vReqId,
  ok: literal(false),
  error: vErrorCode,
});

/** Data `result` divalidasi terpisah dengan RESULT_DATA setelah reqId dicocokkan. */
const any: Validator<unknown> = (input) => ok(input);

const resultFrame: Validator<ResultOkFrame | ResultErrorFrame> = (input, path = '') =>
  isPlainObject(input) && input['ok'] === true
    ? resultOkFrame(input, path)
    : resultErrorFrame(input, path);

const EVENT_PAYLOADS: { [K in EventPayload['t']]: Validator<Extract<EventPayload, { t: K }>> } = {
  new: obj({ t: literal('new'), seq: vSeq }),
  opened: obj({ t: literal('opened'), msgId: vMsgId, remainingMs: vDurationMs }),
  retracted: obj({ t: literal('retracted'), msgId: vMsgId }),
  ttl_proposed: obj({ t: literal('ttl_proposed'), ttl: vTtl }),
  ttl_changed: obj({ t: literal('ttl_changed'), ttl: vTtl }),
  ttl_rejected: obj({ t: literal('ttl_rejected'), ttl: vTtl }),
};

export const eventPayload: Validator<EventPayload> = discriminated(EVENT_PAYLOADS);

export const eventFrame: Validator<EventFrame> = obj({
  t: literal('event'),
  inboxRoomId: vInboxRoomId,
  payload: eventPayload,
});

const SERVER_FRAMES: { [K in ServerFrame['t']]: Validator<Extract<ServerFrame, { t: K }>> } = {
  challenge: challengeFrame,
  ready: readyFrame,
  pong: pongFrame,
  result: resultFrame,
  event: eventFrame,
  expiring: expiringFrame,
};

export const serverFrame: Validator<ServerFrame> = discriminated(SERVER_FRAMES);

// ================================================================ data result

const empty: Validator<EmptyResult> = (input, path = '') =>
  isPlainObject(input) && Object.keys(input).length === 0
    ? ok({})
    : fail(path, 'harus objek kosong');

export const roomListItem: Validator<RoomListItem> = obj({
  inboxRoomId: vInboxRoomId,
  sealedHeader: vSealedHeader,
  unread: int(0, Number.MAX_SAFE_INTEGER),
});

export const syncedMessage: Validator<SyncedMessage> = obj(
  {
    msgId: vMsgId,
    seq: vSeq,
    mine: bool,
    ttl: vTtl,
    body: vBody,
    key: vSealedKey,
    chunks: vChunkCount,
  },
  { remainingMs: vDurationMs },
);

export const RESULT_DATA: { [K in keyof ResultDataMap]: Validator<ResultDataMap[K]> } = {
  rooms: obj({ rooms: arr(roomListItem, 0, 10_000) }) satisfies Validator<RoomsResult>,
  'rooms.setUnread': empty,
  'rooms.forget': empty,
  'room.init': obj({ ttl: vTtl, created: bool }) satisfies Validator<InitResult>,
  'room.sync': obj(
    {
      messages: arr(syncedMessage, 0, LIMITS.ROOM_MAX_PENDING_MESSAGES),
      ttl: vTtl,
      expiresInMs: vDurationMs,
    },
    { pendingTtl: obj({ ttl: vTtl, mine: bool }) },
  ) satisfies Validator<SyncResult>,
  'room.send': obj({ seq: vSeq }) satisfies Validator<SendResult>,
  'room.getChunk': obj({
    data: b64uExact(AEAD_OVERHEAD + IMAGE.CHUNK_BYTES),
  }) satisfies Validator<GetChunkResult>,
  'room.opened': obj({
    opened: arr(obj({ msgId: vMsgId, remainingMs: vDurationMs }), 0, MESSAGE.OPENED_MAX_IDS),
  }) satisfies Validator<OpenedResult>,
  'room.retract': empty,
  'room.ttl': obj({ ttl: vTtl }) satisfies Validator<TtlResult>,
  'room.purge': empty,
  'room.chunk': obj({ complete: bool }) satisfies Validator<PutChunkResult>,
};

// ================================================================ plaintext terdekripsi

export const roomHeader: Validator<RoomHeader> = obj({
  v: literal(1),
  peerUserId: vUserId,
  peerUsername: vUsername,
  peerEdPk: vEdPk,
  peerXPk: vXPk,
  peerXPkSig: vSig,
  peerExpiresAt: vRoundedExpiry,
});

export const innerImage: Validator<InnerImage> = refine(
  obj({
    w: int(1, IMAGE.MAX_EDGE_PX),
    h: int(1, IMAGE.MAX_EDGE_PX),
    mime: oneOf(IMAGE.OUTPUT_MIME),
    chunks: int(1, IMAGE_MAX_CHUNKS),
    bytes: int(1, IMAGE.OUTPUT_MAX_BYTES),
    hash: b64uExact(SIZES.IMAGE_HASH),
  }),
  // sodium_pad selalu menambah ≥ 1 byte (PRD §4.5).
  (img) => img.chunks === Math.ceil((img.bytes + 1) / IMAGE.CHUNK_BYTES),
  'jumlah chunk tidak sesuai ukuran gambar',
);

export const inner: Validator<Inner> = refine(
  obj(
    {
      v: literal(1),
      kind: oneOf(['text', 'image'] as const),
      msgId: vMsgId,
      roomId: vRoomId,
      fromEdPk: vEdPk,
      ttl: vTtl,
      ts: vTimestamp,
      sig: vSig,
    },
    { text: text(0, MESSAGE.TEXT_MAX_CHARS), image: innerImage },
  ),
  (m) =>
    m.kind === 'text'
      ? m.image === undefined && m.text !== undefined && m.text.length > 0
      : m.image !== undefined &&
        (m.text === undefined || codePointLength(m.text) <= MESSAGE.CAPTION_MAX_CHARS),
  'isi tidak sesuai jenis pesan',
);

export const contact: Validator<Contact> = obj({
  userId: vUserId,
  edPk: vEdPk,
  username: vUsername,
  verified: bool,
  blocked: bool,
});

export const contactList: Validator<Contact[]> = refine(
  arr(contact, 0, 1000),
  (list) => new Set(list.map((c) => c.userId)).size === list.length,
  'userId kontak tidak boleh berulang',
);

// ================================================================ parsing teks JSON

/** Parse JSON dengan batas ukuran byte UTF-8, lalu validasi. */
export function parseJson<T>(raw: string, validate: Validator<T>, maxBytes: number): Result<T> {
  // Batas kasar dulu supaya string raksasa tidak di-encode ulang.
  if (raw.length > maxBytes || utf8Encode(raw).length > maxBytes) return fail('', 'terlalu besar');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail('', 'JSON tidak valid');
  }
  return validate(parsed);
}

export function parseClientFrame(raw: string): Result<ClientFrame> {
  return parseJson(raw, clientFrame, LIMITS.WS_JSON_FRAME_MAX_BYTES);
}

/** Frame server bisa membawa chunk gambar (base64url) di result getChunk. */
export const SERVER_FRAME_MAX_BYTES = 1024 * 1024;

export function parseServerFrame(raw: string): Result<ServerFrame> {
  return parseJson(raw, serverFrame, SERVER_FRAME_MAX_BYTES);
}

// ================================================================ util

function discriminated<M extends Record<string, Validator<unknown>>>(
  map: M,
): Validator<M[keyof M] extends Validator<infer T> ? T : never> {
  return (input, path = '') => {
    if (!isPlainObject(input)) return fail(path, 'harus objek');
    const t = input['t'];
    if (typeof t !== 'string' || !Object.hasOwn(map, t))
      return fail(`${path}.t`, 'jenis frame tidak dikenal');
    return map[t]!(input, path) as Result<M[keyof M] extends Validator<infer T> ? T : never>;
  };
}
