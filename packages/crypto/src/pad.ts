import { CryptoError, sodium } from './sodium.js';

/** Padding ISO/IEC 7816-4 (sodium_pad) ke kelipatan `block`. Selalu menambah ≥ 1 byte. */
export function pad(data: Uint8Array, block: number): Uint8Array {
  return sodium().pad(data, block);
}

/** Kebalikan pad. Melempar CryptoError jika panjang bukan kelipatan `block` atau padding rusak. */
export function unpad(padded: Uint8Array, block: number): Uint8Array {
  if (padded.length === 0 || padded.length % block !== 0) {
    throw new CryptoError('panjang data ber-padding tidak valid');
  }
  try {
    return sodium().unpad(padded, block);
  } catch {
    throw new CryptoError('padding rusak');
  }
}
