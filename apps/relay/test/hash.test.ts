// Kompatibilitas relay ↔ client (D-007): BLAKE2b @noble/hashes dan Ed25519 WebCrypto di relay harus
// menghasilkan/menerima nilai yang sama persis dengan libsodium di client. Vektor dibuat oleh generator
// independen di packages/crypto/test.
import {
  base64urlDecode,
  base64urlEncode,
  canonicalJson,
  concatBytes,
  hexDecode,
  hexEncode,
  LABELS,
  utf8Encode,
} from '@blackchat/protocol';
import { describe, expect, it } from 'vitest';
import base from '../../../packages/crypto/test/vectors.json';
import room from '../../../packages/crypto/test/vectors-room.json';
import { blake2b, userIdFromEdPk } from '../src/hash.js';
import { timingSafeEqual, verifyEd25519, verifyFields, verifyXPk } from '../src/verify.js';

const b = base64urlDecode;

describe('BLAKE2b relay = libsodium client', () => {
  it('tanpa kunci, 20 byte: userId', () => {
    expect(userIdFromEdPk(b(base.alice.edPk))).toBe(base.alice.userId);
    expect(userIdFromEdPk(b(base.bob.edPk))).toBe(base.bob.userId);
  });

  it('dengan kunci, 32 byte: roomId & inboxRoomId', () => {
    const shared = hexDecode(room.room.shared);
    expect(hexEncode(blake2b(32, utf8Encode(LABELS.ROOM_ID), shared))).toBe(room.room.roomId);
    const inbox = blake2b(
      32,
      concatBytes(utf8Encode(LABELS.INBOX_ROOM), b(base.alice.edPk)),
      shared,
    );
    expect(hexEncode(inbox)).toBe(room.room.alice.inboxRoomId);
  });

  it('dengan kunci, 16 byte: memberTag', () => {
    const tag = blake2b(16, utf8Encode(LABELS.TAG), b(room.room.bob.memberKey));
    expect(hexEncode(tag)).toBe(room.room.bob.memberTag);
  });

  it('opHash dan proof member (dipakai RoomDO di W5)', () => {
    expect(canonicalJson(room.proof.op)).toBe(room.proof.opCanonical);
    const opHash = blake2b(32, utf8Encode(LABELS.OP + canonicalJson(room.proof.op)));
    expect(hexEncode(opHash)).toBe(room.proof.opHash);
    const proof = blake2b(
      32,
      concatBytes(utf8Encode(LABELS.PROOF), b(room.proof.opNonce), opHash),
      b(room.room.alice.memberKey),
    );
    expect(base64urlEncode(proof)).toBe(room.proof.proof);
  });
});

describe('Ed25519 WebCrypto relay menerima tanda tangan libsodium', () => {
  it('xPkSig', async () => {
    expect(await verifyXPk(b(base.alice.edPk), b(base.alice.xPk), b(base.alice.xPkSig))).toBe(true);
    expect(await verifyXPk(b(base.alice.edPk), b(base.bob.xPk), b(base.alice.xPkSig))).toBe(false);
  });

  it('request bertanda tangan (canonical JSON)', async () => {
    const { fields, sig } = base.deleteRequest;
    expect(await verifyFields(b(base.alice.edPk), LABELS.REQ_DELETE, fields, b(sig))).toBe(true);
    expect(
      await verifyFields(b(base.alice.edPk), LABELS.REQ_DELETE, { ...fields, seq: 8 }, b(sig)),
    ).toBe(false);
    expect(await verifyFields(b(base.bob.edPk), LABELS.REQ_DELETE, fields, b(sig))).toBe(false);
  });

  it('challenge WebSocket (dipakai InboxDO di W5)', async () => {
    const message = concatBytes(
      utf8Encode(LABELS.WS_AUTH),
      utf8Encode(base.alice.userId),
      hexDecode(base.wsChallenge.nonce),
    );
    expect(await verifyEd25519(b(base.alice.edPk), message, b(base.wsChallenge.sig))).toBe(true);
  });

  it('ukuran tidak valid → false, bukan exception', async () => {
    expect(await verifyEd25519(new Uint8Array(31), new Uint8Array(1), new Uint8Array(64))).toBe(
      false,
    );
    expect(await verifyEd25519(b(base.alice.edPk), new Uint8Array(1), new Uint8Array(63))).toBe(
      false,
    );
  });

  it('timingSafeEqual peka panjang', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([1]), new Uint8Array([1, 0]))).toBe(false);
  });
});
