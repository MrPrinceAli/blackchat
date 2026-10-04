import {
  base32CrockfordEncode,
  concatBytes,
  LABELS,
  signingBytes,
  SIZES,
  utf8Encode,
} from '@blackchat/protocol';
import { randomBytes, wipe } from './bytes.js';
import { blake2b } from './hash.js';
import { CryptoError, sodium } from './sodium.js';

/** Identitas akun (PRD §4.2). edSk dan xSk rahasia: panggil wipeIdentity setelah tidak dipakai. */
export interface Identity {
  edPk: Uint8Array;
  edSk: Uint8Array;
  xPk: Uint8Array;
  xSk: Uint8Array;
  /** Ed25519(edSk, "bc-xpk-v1" || xPk). */
  xPkSig: Uint8Array;
  userId: string;
}

const SEED_BYTES = 32;

/** Identitas deterministik dari dua seed 32 byte. Dipakai generateIdentity dan vektor uji. */
export function identityFromSeeds(edSeed: Uint8Array, xSeed: Uint8Array): Identity {
  if (edSeed.length !== SEED_BYTES || xSeed.length !== SEED_BYTES) {
    throw new CryptoError('seed harus 32 byte');
  }
  const s = sodium();
  const ed = s.crypto_sign_seed_keypair(edSeed);
  const x = s.crypto_box_seed_keypair(xSeed);
  return {
    edPk: ed.publicKey,
    edSk: ed.privateKey,
    xPk: x.publicKey,
    xSk: x.privateKey,
    xPkSig: signXPk(ed.privateKey, x.publicKey),
    userId: userIdFromEdPk(ed.publicKey),
  };
}

export function generateIdentity(): Identity {
  const edSeed = randomBytes(SEED_BYTES);
  const xSeed = randomBytes(SEED_BYTES);
  try {
    return identityFromSeeds(edSeed, xSeed);
  } finally {
    wipe(edSeed, xSeed);
  }
}

/** Bangun ulang identitas dari kunci rahasia hasil openVault (kunci publik diturunkan ulang). */
export function identityFromSecretKeys(edSk: Uint8Array, xSk: Uint8Array): Identity {
  if (edSk.length !== SIZES.ED_SK || xSk.length !== SIZES.X_SK) {
    throw new CryptoError('ukuran kunci rahasia tidak valid');
  }
  const s = sodium();
  const edPk = s.crypto_sign_ed25519_sk_to_pk(edSk);
  const xPk = s.crypto_scalarmult_base(xSk);
  return { edPk, edSk, xPk, xSk, xPkSig: signXPk(edSk, xPk), userId: userIdFromEdPk(edPk) };
}

export function wipeIdentity(identity: Identity): void {
  wipe(identity.edSk, identity.xSk);
}

/** userId = base32-crockford(BLAKE2b-160(edPk)), 32 karakter (PRD §4.2). */
export function userIdFromEdPk(edPk: Uint8Array): string {
  if (edPk.length !== SIZES.ED_PK) throw new CryptoError('edPk harus 32 byte');
  return base32CrockfordEncode(blake2b(SIZES.USER_ID_HASH, edPk));
}

export function sign(edSk: Uint8Array, message: Uint8Array): Uint8Array {
  if (edSk.length !== SIZES.ED_SK) throw new CryptoError('edSk harus 64 byte');
  return sodium().crypto_sign_detached(message, edSk);
}

/** Verifikasi Ed25519. Ukuran kunci/tanda tangan yang salah → false (bukan exception). */
export function verify(edPk: Uint8Array, message: Uint8Array, sig: Uint8Array): boolean {
  if (edPk.length !== SIZES.ED_PK || sig.length !== SIZES.ED_SIG) return false;
  try {
    return sodium().crypto_sign_verify_detached(sig, message, edPk);
  } catch {
    return false;
  }
}

const xPkMessage = (xPk: Uint8Array): Uint8Array => concatBytes(utf8Encode(LABELS.XPK), xPk);

export function signXPk(edSk: Uint8Array, xPk: Uint8Array): Uint8Array {
  if (xPk.length !== SIZES.X_PK) throw new CryptoError('xPk harus 32 byte');
  return sign(edSk, xPkMessage(xPk));
}

/** Pastikan xPk benar milik pemegang edPk (PRD §4.2). Wajib dicek setiap menerima kunci lawan. */
export function verifyXPk(edPk: Uint8Array, xPk: Uint8Array, xPkSig: Uint8Array): boolean {
  if (xPk.length !== SIZES.X_PK) return false;
  return verify(edPk, xPkMessage(xPk), xPkSig);
}

/** Tanda tangan request akun: Ed25519(edSk, label || canonical(fields)) (PRD §5.2). */
export function signFields(edSk: Uint8Array, label: string, fields: unknown): Uint8Array {
  return sign(edSk, signingBytes(label, fields));
}

export function verifyFields(
  edPk: Uint8Array,
  label: string,
  fields: unknown,
  sig: Uint8Array,
): boolean {
  return verify(edPk, signingBytes(label, fields), sig);
}

/** Pesan challenge WebSocket: "bc-ws-auth-v1" || utf8(userId) || nonce (PRD §6.1, D-008). */
export function wsChallengeMessage(userId: string, nonce: Uint8Array): Uint8Array {
  if (nonce.length !== SIZES.WS_CHALLENGE) throw new CryptoError('nonce challenge harus 32 byte');
  return concatBytes(utf8Encode(LABELS.WS_AUTH), utf8Encode(userId), nonce);
}

export function signWsChallenge(edSk: Uint8Array, userId: string, nonce: Uint8Array): Uint8Array {
  return sign(edSk, wsChallengeMessage(userId, nonce));
}
