import { AEAD_OVERHEAD, concatBytes, SIZES, utf8Encode } from '@blackchat/protocol';
import { randomBytes } from './bytes.js';
import { CryptoError, sodium } from './sodium.js';

export type Aad = string | Uint8Array;

const aadBytes = (aad: Aad): Uint8Array => (typeof aad === 'string' ? utf8Encode(aad) : aad);

/** XChaCha20-Poly1305 dengan nonce acak. Output: nonce(24) || ciphertext || tag(16). AAD wajib. */
export function aeadEncrypt(key: Uint8Array, plaintext: Uint8Array, aad: Aad): Uint8Array {
  if (key.length !== SIZES.AEAD_KEY) throw new CryptoError('kunci AEAD harus 32 byte');
  const nonce = randomBytes(SIZES.AEAD_NONCE);
  const s = sodium();
  const ciphertext = s.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    aadBytes(aad),
    null,
    nonce,
    key,
  );
  return concatBytes(nonce, ciphertext);
}

/** Kebalikan aeadEncrypt. Melempar CryptoError jika kunci, AAD, atau ciphertext tidak cocok. Pemanggil wajib wipe hasilnya. */
export function aeadDecrypt(key: Uint8Array, box: Uint8Array, aad: Aad): Uint8Array {
  if (key.length !== SIZES.AEAD_KEY) throw new CryptoError('kunci AEAD harus 32 byte');
  if (box.length < AEAD_OVERHEAD) throw new CryptoError('ciphertext terlalu pendek');
  try {
    return sodium().crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      box.subarray(SIZES.AEAD_NONCE),
      aadBytes(aad),
      box.subarray(0, SIZES.AEAD_NONCE),
      key,
    );
  } catch {
    throw new CryptoError('dekripsi gagal');
  }
}
