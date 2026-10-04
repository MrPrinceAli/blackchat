import {
  base64urlDecode,
  base64urlEncode,
  canonicalJson,
  concatBytes,
  hexDecode,
  inner as innerValidator,
  LABELS,
  MESSAGE,
  SIZES,
  utf8Decode,
  utf8Encode,
  type Inner,
  type Ttl,
  type UnsignedInner,
} from '@blackchat/protocol';
import { aeadDecrypt, aeadEncrypt } from './aead.js';
import { equalBytes, randomBytes, wipe } from './bytes.js';
import { sign, verify } from './keys.js';
import { pad, unpad } from './pad.js';
import { sealOpen, sealTo } from './seal.js';
import { CryptoError } from './sodium.js';

/** Kunci konten acak per pesan (PRD §4.5 langkah 1). Pemanggil wajib wipe setelah selesai. */
export function newContentKey(): Uint8Array {
  return randomBytes(SIZES.CONTENT_KEY);
}

const innerSigningBytes = (unsigned: UnsignedInner): Uint8Array =>
  utf8Encode(LABELS.INNER + canonicalJson(unsigned));

/** sig = Ed25519(edSk, "bc-inner-v1" || canonical(Inner tanpa sig)) (PRD §4.7, D-008). */
export function signInner(edSk: Uint8Array, unsigned: UnsignedInner): Inner {
  const candidate = { ...unsigned, sig: base64urlEncode(new Uint8Array(SIZES.ED_SIG)) };
  const checked = innerValidator(candidate);
  if (!checked.ok) throw new CryptoError(`Inner tidak valid: ${checked.error}`);
  const { sig: _placeholder, ...clean } = checked.value;
  return { ...clean, sig: base64urlEncode(sign(edSk, innerSigningBytes(clean))) };
}

export interface InnerExpectation {
  /** edPk pengirim yang diharapkan: lawan untuk pesan masuk, diri sendiri untuk pesan milik sendiri. */
  fromEdPk: Uint8Array;
  roomId: string;
  msgId: string;
}

/** Aturan tolak PRD §4.7: sig salah, pengirim bukan yang diharapkan, roomId/msgId tidak cocok dengan record. */
export function verifyInner(inner: Inner, expected: InnerExpectation): boolean {
  if (inner.roomId !== expected.roomId || inner.msgId !== expected.msgId) return false;
  let fromEdPk: Uint8Array;
  try {
    fromEdPk = base64urlDecode(inner.fromEdPk);
  } catch {
    return false;
  }
  if (!equalBytes(fromEdPk, expected.fromEdPk)) return false;
  const { sig, ...unsigned } = inner;
  let sigBytes: Uint8Array;
  try {
    sigBytes = base64urlDecode(sig);
  } catch {
    return false;
  }
  return verify(fromEdPk, innerSigningBytes(unsigned), sigBytes);
}

/** AAD body pesan: "bc-msg-v1" || roomId(32 byte) || msgId(16 byte) (PRD §4.5). */
export function messageAad(roomId: string, msgId: string): Uint8Array {
  return concatBytes(utf8Encode(LABELS.MSG), hexDecode(roomId), base64urlDecode(msgId));
}

export interface EncryptedMessage {
  body: Uint8Array;
  keyForPeer: Uint8Array;
  keyForSelf: Uint8Array;
}

/**
 * body = AEAD(contentKey, pad256(canonical(Inner)), aad); contentKey disegel ke lawan dan ke diri sendiri
 * (PRD §4.5). Untuk gambar, contentKey yang sama dipakai untuk chunk (encryptImage), jadi pemanggil
 * yang memegang dan me-wipe contentKey.
 */
export function encryptMessage(args: {
  inner: Inner;
  contentKey: Uint8Array;
  myXPk: Uint8Array;
  peerXPk: Uint8Array;
}): EncryptedMessage {
  const { inner, contentKey } = args;
  if (contentKey.length !== SIZES.CONTENT_KEY) throw new CryptoError('contentKey harus 32 byte');
  const checked = innerValidator(inner);
  if (!checked.ok) throw new CryptoError(`Inner tidak valid: ${checked.error}`);
  const plaintext = utf8Encode(canonicalJson(checked.value));
  const padded = pad(plaintext, MESSAGE.TEXT_PAD_BLOCK);
  try {
    if (padded.length > MESSAGE.BODY_MAX_PAD_BLOCKS * MESSAGE.TEXT_PAD_BLOCK) {
      throw new CryptoError('pesan terlalu besar');
    }
    return {
      body: aeadEncrypt(contentKey, padded, messageAad(inner.roomId, inner.msgId)),
      keyForPeer: sealTo(args.peerXPk, contentKey),
      keyForSelf: sealTo(args.myXPk, contentKey),
    };
  } finally {
    wipe(plaintext, padded);
  }
}

export interface DecryptedMessage {
  inner: Inner;
  /** Dibutuhkan untuk mendekripsi chunk gambar. Pemanggil wajib wipe. */
  contentKey: Uint8Array;
}

/**
 * Buka pesan dari record server. `key` = keyForSelf untuk pesan sendiri, keyForPeer untuk pesan lawan.
 * Melempar CryptoError jika kunci/ciphertext salah, Inner tidak valid, atau aturan PRD §4.7 dilanggar.
 */
export function decryptMessage(args: {
  body: Uint8Array;
  key: Uint8Array;
  myXPk: Uint8Array;
  myXSk: Uint8Array;
  expected: InnerExpectation;
}): DecryptedMessage {
  const contentKey = sealOpen(args.myXPk, args.myXSk, args.key);
  let padded: Uint8Array | undefined;
  let plaintext: Uint8Array | undefined;
  try {
    if (contentKey.length !== SIZES.CONTENT_KEY) throw new CryptoError('contentKey tidak valid');
    padded = aeadDecrypt(
      contentKey,
      args.body,
      messageAad(args.expected.roomId, args.expected.msgId),
    );
    plaintext = unpad(padded, MESSAGE.TEXT_PAD_BLOCK);
    let parsed: unknown;
    try {
      parsed = JSON.parse(utf8Decode(plaintext));
    } catch {
      throw new CryptoError('isi pesan bukan JSON');
    }
    const checked = innerValidator(parsed);
    if (!checked.ok) throw new CryptoError(`Inner tidak valid: ${checked.error}`);
    if (!verifyInner(checked.value, args.expected))
      throw new CryptoError('pesan ditolak (PRD §4.7)');
    return { inner: checked.value, contentKey };
  } catch (error) {
    wipe(contentKey);
    throw error;
  } finally {
    wipe(padded, plaintext);
  }
}

/** Penerima memakai min(ttl di Inner, ttl di record server) (PRD §7.3). */
export function effectiveTtl(innerTtl: Ttl, recordTtl: Ttl): Ttl {
  return innerTtl < recordTtl ? innerTtl : recordTtl;
}
