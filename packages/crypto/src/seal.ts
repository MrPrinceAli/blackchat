import { SIZES } from '@blackchat/protocol';
import { CryptoError, sodium } from './sodium.js';

/** crypto_box_seal ke kunci publik X25519 (PRD §4.5). */
export function sealTo(publicKey: Uint8Array, message: Uint8Array): Uint8Array {
  if (publicKey.length !== SIZES.X_PK) throw new CryptoError('kunci publik X25519 harus 32 byte');
  return sodium().crypto_box_seal(message, publicKey);
}

/** Buka sealed box. Melempar CryptoError jika bukan untuk pasangan kunci ini. Pemanggil wajib wipe hasilnya. */
export function sealOpen(
  publicKey: Uint8Array,
  secretKey: Uint8Array,
  ciphertext: Uint8Array,
): Uint8Array {
  if (ciphertext.length < SIZES.SEAL_OVERHEAD) throw new CryptoError('sealed box terlalu pendek');
  try {
    return sodium().crypto_box_seal_open(ciphertext, publicKey, secretKey);
  } catch {
    throw new CryptoError('sealed box gagal dibuka');
  }
}
