// Verifikasi bukti keanggotaan room (PRD §4.6, D-009) di relay. Harus identik dengan packages/crypto/src/room.ts;
// diuji terhadap test/vectors-room.json.
import {
  base64urlDecode,
  canonicalJson,
  concatBytes,
  LABELS,
  SIZES,
  utf8Encode,
  type RoomAuth,
  type RoomOp,
} from '@blackchat/protocol';
import { blake2b } from './hash.js';
import { timingSafeEqual } from './verify.js';

/** opHash = BLAKE2b-256(utf8("bc-op-v1" || canonical(op))). */
export function opHash(op: RoomOp): Uint8Array {
  return blake2b(SIZES.OP_HASH, utf8Encode(LABELS.OP + canonicalJson(op)));
}

/** proof = BLAKE2b-256(key=memberKey, "bc-proof-v1" || opNonce || opHash). */
export function expectedProof(memberKey: Uint8Array, opNonce: Uint8Array, op: RoomOp): Uint8Array {
  return blake2b(
    SIZES.PROOF,
    concatBytes(utf8Encode(LABELS.PROOF), opNonce, opHash(op)),
    memberKey,
  );
}

export function verifyRoomAuth(memberKey: Uint8Array, op: RoomOp, auth: RoomAuth): boolean {
  const proof = base64urlDecode(auth.proof);
  return timingSafeEqual(expectedProof(memberKey, base64urlDecode(auth.opNonce), op), proof);
}
