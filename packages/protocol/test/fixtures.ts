// Contoh valid untuk setiap validator. Test mutasi mengubah contoh ini satu field per kali.
import {
  AEAD_OVERHEAD,
  CONTACTS,
  HEADER,
  IMAGE,
  MESSAGE,
  SEALED_KEY_BYTES,
  SIZES,
  VAULT_BYTES,
  base64urlEncode,
  hexEncode,
  type Validator,
} from '../src/index.js';
import * as v from '../src/validate.js';

export const b64 = (bytes: number, fill = 7): string =>
  base64urlEncode(new Uint8Array(bytes).fill(fill));
export const hex = (bytes: number, fill = 0xab): string =>
  hexEncode(new Uint8Array(bytes).fill(fill));

export const USER_ID = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const PEER_ID = 'ZYXWVTSRQPNMKJHGFEDCBA9876543210';
export const ROOM_ID = hex(SIZES.ROOM_ID, 0x01);
export const MY_INBOX = hex(SIZES.INBOX_ROOM_ID, 0x02);
export const PEER_INBOX = hex(SIZES.INBOX_ROOM_ID, 0x03);
export const MSG_ID = b64(SIZES.MSG_ID, 1);
export const HOUR = 3_600_000;

export const auth = {
  memberTag: hex(SIZES.MEMBER_TAG, 0x11),
  opNonce: b64(16, 2),
  proof: b64(32, 3),
};
const body = b64(AEAD_OVERHEAD + MESSAGE.TEXT_PAD_BLOCK);
const sealedKey = b64(SEALED_KEY_BYTES);
const sealedHeader = b64(HEADER.SEALED_BYTES);
const route = { peerUserId: PEER_ID, peerInboxRoomId: PEER_INBOX };

export const ops = {
  init: {
    kind: 'init',
    roomId: ROOM_ID,
    members: [
      { memberTag: hex(16, 0x11), memberKey: b64(32, 4) },
      { memberTag: hex(16, 0x22), memberKey: b64(32, 5) },
    ],
    ttl: 5,
  },
  sync: { kind: 'sync', roomId: ROOM_ID, sinceSeq: 0 },
  send: {
    kind: 'send',
    roomId: ROOM_ID,
    msgId: MSG_ID,
    ttl: 5,
    body,
    keyForPeer: sealedKey,
    keyForSelf: sealedKey,
    chunks: 0,
  },
  putChunk: { kind: 'putChunk', roomId: ROOM_ID, msgId: MSG_ID, idx: 0 },
  getChunk: { kind: 'getChunk', roomId: ROOM_ID, msgId: MSG_ID, idx: 1 },
  opened: { kind: 'opened', roomId: ROOM_ID, msgIds: [MSG_ID] },
  retract: { kind: 'retract', roomId: ROOM_ID, msgId: MSG_ID },
  ttl: { kind: 'ttl', roomId: ROOM_ID, action: 'propose', ttl: 3 },
  purge: { kind: 'purge', roomId: ROOM_ID },
};

export interface Case {
  name: string;
  validator: Validator<unknown>;
  valid: Record<string, unknown>;
  /** Field yang boleh tidak ada. */
  optional?: string[];
  /** Field yang menerima nilai apa pun (tidak diuji dengan tipe salah). */
  anyValue?: string[];
  /** Field yang boleh bernilai null. */
  nullable?: string[];
}

export const cases: Case[] = [
  // ------------------------------------------------ akun
  {
    name: 'registerRequest',
    validator: v.registerRequest,
    valid: {
      username: 'rara_01',
      salt: b64(16),
      authKey: b64(32),
      edPk: b64(32),
      xPk: b64(32),
      xPkSig: b64(64),
      vault: b64(VAULT_BYTES),
      sig: b64(64),
    },
  },
  {
    name: 'registerResponse',
    validator: v.registerResponse,
    valid: { userId: USER_ID, expiresAt: 1_800_000_000_123, remainingMs: 259_200_000 },
  },
  { name: 'saltResponse', validator: v.saltResponse, valid: { salt: b64(16) } },
  {
    name: 'loginRequest',
    validator: v.loginRequest,
    valid: { username: 'rara', authKey: b64(32) },
  },
  {
    name: 'loginResponse',
    validator: v.loginResponse,
    valid: {
      userId: USER_ID,
      edPk: b64(32),
      xPk: b64(32),
      xPkSig: b64(64),
      vault: b64(VAULT_BYTES),
      contacts: b64(AEAD_OVERHEAD + CONTACTS.PAD_BLOCK),
      expiresAt: 1_800_000_000_123,
      remainingMs: 1000,
      seq: 3,
    },
    nullable: ['contacts'],
  },
  {
    name: 'lookupResponse',
    validator: v.lookupResponse,
    valid: {
      userId: USER_ID,
      edPk: b64(32),
      xPk: b64(32),
      xPkSig: b64(64),
      expiresAt: 500_000 * HOUR,
    },
  },
  {
    name: 'contactsRequest',
    validator: v.contactsRequest,
    valid: {
      userId: USER_ID,
      contacts: b64(AEAD_OVERHEAD + CONTACTS.PAD_BLOCK),
      seq: 1,
      sig: b64(64),
    },
  },
  {
    name: 'passwordRequest',
    validator: v.passwordRequest,
    valid: {
      userId: USER_ID,
      salt: b64(16),
      authKey: b64(32),
      vault: b64(VAULT_BYTES),
      seq: 2,
      sig: b64(64),
    },
  },
  {
    name: 'deleteAccountRequest',
    validator: v.deleteAccountRequest,
    valid: { userId: USER_ID, seq: 4, sig: b64(64) },
  },
  // ------------------------------------------------ op
  { name: 'initOp', validator: v.initOp, valid: ops.init },
  { name: 'syncOp', validator: v.syncOp, valid: ops.sync },
  { name: 'sendOp', validator: v.sendOp, valid: ops.send },
  { name: 'putChunkOp', validator: v.putChunkOp, valid: ops.putChunk },
  { name: 'getChunkOp', validator: v.getChunkOp, valid: ops.getChunk },
  { name: 'openedOp', validator: v.openedOp, valid: ops.opened },
  { name: 'retractOp', validator: v.retractOp, valid: ops.retract },
  { name: 'ttlOp', validator: v.ttlOp, valid: ops.ttl },
  { name: 'purgeOp', validator: v.purgeOp, valid: ops.purge },
  { name: 'roomAuth', validator: v.roomAuth, valid: auth },
  // ------------------------------------------------ frame client
  { name: 'ping', validator: v.clientFrame, valid: { t: 'ping' } },
  { name: 'auth', validator: v.clientFrame, valid: { t: 'auth', sig: b64(64) } },
  { name: 'rooms', validator: v.clientFrame, valid: { t: 'rooms', reqId: 1 } },
  {
    name: 'rooms.setUnread',
    validator: v.clientFrame,
    valid: { t: 'rooms.setUnread', reqId: 2, inboxRoomId: MY_INBOX, n: 3 },
  },
  {
    name: 'rooms.forget',
    validator: v.clientFrame,
    valid: { t: 'rooms.forget', reqId: 2, inboxRoomId: MY_INBOX },
  },
  {
    name: 'room.init',
    validator: v.clientFrame,
    valid: {
      t: 'room.init',
      reqId: 3,
      op: ops.init,
      auth,
      ...route,
      myInboxRoomId: MY_INBOX,
      sealedHeaderForSelf: sealedHeader,
      sealedHeaderForPeer: sealedHeader,
    },
  },
  {
    name: 'room.sync',
    validator: v.clientFrame,
    valid: { t: 'room.sync', reqId: 4, op: ops.sync, auth },
  },
  {
    name: 'room.send',
    validator: v.clientFrame,
    valid: {
      t: 'room.send',
      reqId: 5,
      op: ops.send,
      auth,
      ...route,
      sealedHeaderForPeer: sealedHeader,
    },
    optional: ['sealedHeaderForPeer'],
  },
  {
    name: 'room.getChunk',
    validator: v.clientFrame,
    valid: { t: 'room.getChunk', reqId: 6, op: ops.getChunk, auth },
  },
  {
    name: 'room.opened',
    validator: v.clientFrame,
    valid: { t: 'room.opened', reqId: 7, op: ops.opened, auth, ...route },
  },
  {
    name: 'room.retract',
    validator: v.clientFrame,
    valid: { t: 'room.retract', reqId: 8, op: ops.retract, auth, ...route },
  },
  {
    name: 'room.ttl',
    validator: v.clientFrame,
    valid: { t: 'room.ttl', reqId: 9, op: ops.ttl, auth, ...route },
  },
  {
    name: 'room.purge',
    validator: v.clientFrame,
    valid: { t: 'room.purge', reqId: 10, op: ops.purge, auth },
  },
  {
    name: 'chunkFrameHeader',
    validator: v.chunkFrameHeader,
    valid: { reqId: 11, op: ops.putChunk, auth, ...route, sealedHeaderForPeer: sealedHeader },
    optional: ['sealedHeaderForPeer'],
  },
  // ------------------------------------------------ frame server
  { name: 'challenge', validator: v.serverFrame, valid: { t: 'challenge', nonce: b64(32) } },
  { name: 'ready', validator: v.serverFrame, valid: { t: 'ready', remainingMs: 1000 } },
  { name: 'pong', validator: v.serverFrame, valid: { t: 'pong' } },
  {
    name: 'result ok',
    validator: v.serverFrame,
    valid: { t: 'result', reqId: 1, ok: true, data: { seq: 1 } },
    anyValue: ['data'],
  },
  {
    name: 'result error',
    validator: v.serverFrame,
    valid: { t: 'result', reqId: 1, ok: false, error: 'room_full' },
  },
  {
    name: 'event new',
    validator: v.serverFrame,
    valid: { t: 'event', inboxRoomId: MY_INBOX, payload: { t: 'new', seq: 4 } },
  },
  {
    name: 'payload opened',
    validator: v.eventPayload,
    valid: { t: 'opened', msgId: MSG_ID, remainingMs: 5 },
  },
  {
    name: 'payload retracted',
    validator: v.eventPayload,
    valid: { t: 'retracted', msgId: MSG_ID },
  },
  { name: 'payload ttl_proposed', validator: v.eventPayload, valid: { t: 'ttl_proposed', ttl: 7 } },
  { name: 'payload ttl_changed', validator: v.eventPayload, valid: { t: 'ttl_changed', ttl: 7 } },
  { name: 'payload ttl_rejected', validator: v.eventPayload, valid: { t: 'ttl_rejected', ttl: 7 } },
  { name: 'expiring', validator: v.serverFrame, valid: { t: 'expiring', inMs: 3_600_000 } },
  // ------------------------------------------------ data result
  {
    name: 'result rooms',
    validator: v.RESULT_DATA.rooms,
    valid: { rooms: [{ inboxRoomId: MY_INBOX, sealedHeader, unread: 2 }] },
  },
  {
    name: 'result room.init',
    validator: v.RESULT_DATA['room.init'],
    valid: { ttl: 5, created: true },
  },
  {
    name: 'result room.sync',
    validator: v.RESULT_DATA['room.sync'],
    valid: {
      messages: [],
      ttl: 5,
      pendingTtl: { ttl: 3, mine: false },
      expiresInMs: 100,
    },
    optional: ['pendingTtl'],
  },
  {
    name: 'syncedMessage',
    validator: v.syncedMessage,
    valid: {
      msgId: MSG_ID,
      seq: 1,
      mine: false,
      ttl: 5,
      body,
      key: sealedKey,
      chunks: 0,
      remainingMs: 2500,
    },
    optional: ['remainingMs'],
  },
  { name: 'result room.send', validator: v.RESULT_DATA['room.send'], valid: { seq: 9 } },
  {
    name: 'result room.getChunk',
    validator: v.RESULT_DATA['room.getChunk'],
    valid: { data: b64(AEAD_OVERHEAD + IMAGE.CHUNK_BYTES) },
  },
  {
    name: 'result room.opened',
    validator: v.RESULT_DATA['room.opened'],
    valid: { opened: [{ msgId: MSG_ID, remainingMs: 5300 }] },
  },
  { name: 'result room.ttl', validator: v.RESULT_DATA['room.ttl'], valid: { ttl: 10 } },
  { name: 'result room.chunk', validator: v.RESULT_DATA['room.chunk'], valid: { complete: false } },
  // ------------------------------------------------ plaintext
  {
    name: 'roomHeader',
    validator: v.roomHeader,
    valid: {
      v: 1,
      peerUserId: PEER_ID,
      peerUsername: 'dimas',
      peerEdPk: b64(32),
      peerXPk: b64(32),
      peerXPkSig: b64(64),
      peerExpiresAt: 480_000 * HOUR,
    },
  },
  {
    name: 'inner text',
    validator: v.inner,
    valid: {
      v: 1,
      kind: 'text',
      msgId: MSG_ID,
      roomId: ROOM_ID,
      fromEdPk: b64(32),
      ttl: 5,
      ts: 1_800_000_000_000,
      text: 'jam 8 di tempat biasa',
      sig: b64(64),
    },
  },
  {
    name: 'inner image',
    validator: v.inner,
    valid: {
      v: 1,
      kind: 'image',
      msgId: MSG_ID,
      roomId: ROOM_ID,
      fromEdPk: b64(32),
      ttl: 3,
      ts: 1_800_000_000_000,
      text: 'caption',
      image: { w: 1600, h: 900, mime: 'image/webp', chunks: 2, bytes: 300_000, hash: b64(32) },
      sig: b64(64),
    },
    optional: ['text'],
  },
  {
    name: 'contact',
    validator: v.contact,
    valid: { userId: PEER_ID, edPk: b64(32), username: 'rara', verified: false, blocked: false },
  },
];
