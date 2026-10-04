import {
  base64urlEncode,
  canonicalJson,
  concatBytes,
  hexEncode,
  LABELS,
  SIZES,
  utf8Encode,
  type RoomAuth,
  type RoomOp,
} from '@blackchat/protocol';
import { equalBytes, wipe } from './bytes.js';
import { blake2b } from './hash.js';
import { newOpNonce } from './ids.js';
import { CryptoError, sodium } from './sodium.js';

/**
 * Kunci room yang diturunkan dari rahasia X25519 bersama (PRD §4.6, D-001).
 * Semua nilai di sini hanya hidup di memori client; panggil wipeRoomKeys saat room ditutup.
 */
export interface RoomKeys {
  shared: Uint8Array;
  /** Nama RoomDO. */
  roomId: string;
  /** ID room di InboxDO milik sendiri (D-001). */
  myInboxRoomId: string;
  /** ID room di InboxDO lawan (D-001). */
  peerInboxRoomId: string;
  myMemberKey: Uint8Array;
  myMemberTag: string;
  peerMemberKey: Uint8Array;
  peerMemberTag: string;
}

const labelled = (label: string, ...parts: Uint8Array[]): Uint8Array =>
  concatBytes(utf8Encode(label), ...parts);

/** Turunan per anggota dari `shared` dan edPk anggota itu. */
function memberSecrets(shared: Uint8Array, edPk: Uint8Array) {
  const memberKey = blake2b(SIZES.MEMBER_KEY, labelled(LABELS.MEMBER, edPk), shared);
  return {
    inboxRoomId: hexEncode(blake2b(SIZES.INBOX_ROOM_ID, labelled(LABELS.INBOX_ROOM, edPk), shared)),
    memberKey,
    memberTag: memberTagFor(memberKey),
  };
}

/** memberTag = BLAKE2b-128(key=memberKey, "bc-tag-v1"), hex. */
export function memberTagFor(memberKey: Uint8Array): string {
  return hexEncode(blake2b(SIZES.MEMBER_TAG, utf8Encode(LABELS.TAG), memberKey));
}

/**
 * shared = X25519(myXSk, peerXPk); semua turunan identik dihitung dari kedua sisi.
 * Melempar CryptoError untuk kunci publik berorde rendah (shared nol) atau dua edPk yang sama.
 */
export function deriveRoom(
  myXSk: Uint8Array,
  peerXPk: Uint8Array,
  myEdPk: Uint8Array,
  peerEdPk: Uint8Array,
): RoomKeys {
  if (myXSk.length !== SIZES.X_SK || peerXPk.length !== SIZES.X_PK) {
    throw new CryptoError('ukuran kunci X25519 tidak valid');
  }
  if (myEdPk.length !== SIZES.ED_PK || peerEdPk.length !== SIZES.ED_PK) {
    throw new CryptoError('edPk harus 32 byte');
  }
  if (equalBytes(myEdPk, peerEdPk))
    throw new CryptoError('tidak bisa membuat room dengan diri sendiri');
  const s = sodium();
  let shared: Uint8Array;
  try {
    shared = s.crypto_scalarmult(myXSk, peerXPk);
  } catch {
    throw new CryptoError('kunci publik lawan tidak valid');
  }
  if (s.is_zero(shared)) {
    wipe(shared);
    throw new CryptoError('kunci publik lawan tidak valid');
  }
  const me = memberSecrets(shared, myEdPk);
  const peer = memberSecrets(shared, peerEdPk);
  return {
    shared,
    roomId: hexEncode(blake2b(SIZES.ROOM_ID, utf8Encode(LABELS.ROOM_ID), shared)),
    myInboxRoomId: me.inboxRoomId,
    peerInboxRoomId: peer.inboxRoomId,
    myMemberKey: me.memberKey,
    myMemberTag: me.memberTag,
    peerMemberKey: peer.memberKey,
    peerMemberTag: peer.memberTag,
  };
}

export function wipeRoomKeys(keys: RoomKeys): void {
  wipe(keys.shared, keys.myMemberKey, keys.peerMemberKey);
}

/** opHash = BLAKE2b-256(utf8("bc-op-v1" || canonical(op))). Bukti hanya mencakup op (D-009). */
export function opHash(op: RoomOp): Uint8Array {
  return blake2b(SIZES.OP_HASH, utf8Encode(LABELS.OP + canonicalJson(op)));
}

/** proof = BLAKE2b-256(key=memberKey, "bc-proof-v1" || opNonce || opHash) (PRD §4.6). */
export function memberProof(
  memberKey: Uint8Array,
  opNonce: Uint8Array,
  hash: Uint8Array,
): Uint8Array {
  if (memberKey.length !== SIZES.MEMBER_KEY) throw new CryptoError('memberKey harus 32 byte');
  if (opNonce.length !== SIZES.OP_NONCE) throw new CryptoError('opNonce harus 16 byte');
  if (hash.length !== SIZES.OP_HASH) throw new CryptoError('opHash harus 32 byte');
  return blake2b(SIZES.PROOF, labelled(LABELS.PROOF, opNonce, hash), memberKey);
}

/** Bukti keanggotaan untuk satu op dengan opNonce acak baru. */
export function roomAuth(
  keys: Pick<RoomKeys, 'myMemberKey' | 'myMemberTag'>,
  op: RoomOp,
): RoomAuth {
  const opNonce = newOpNonce();
  return {
    memberTag: keys.myMemberTag,
    opNonce: base64urlEncode(opNonce),
    proof: base64urlEncode(memberProof(keys.myMemberKey, opNonce, opHash(op))),
  };
}

/** Verifikasi bukti (dipakai test; relay memakai implementasinya sendiri, D-007). */
export function verifyMemberProof(
  memberKey: Uint8Array,
  opNonce: Uint8Array,
  op: RoomOp,
  proof: Uint8Array,
): boolean {
  if (proof.length !== SIZES.PROOF) return false;
  return equalBytes(memberProof(memberKey, opNonce, opHash(op)), proof);
}
