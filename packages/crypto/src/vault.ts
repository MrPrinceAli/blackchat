import { concatBytes, LABELS, SIZES, VAULT_BYTES } from '@blackchat/protocol';
import { aeadDecrypt, aeadEncrypt } from './aead.js';
import { wipe } from './bytes.js';
import { CryptoError } from './sodium.js';

/** vault = AEAD(vaultKey, edSk || xSk, aad="bc-vault-blob-v1") (PRD §4.3). */
export function sealVault(vaultKey: Uint8Array, edSk: Uint8Array, xSk: Uint8Array): Uint8Array {
  if (edSk.length !== SIZES.ED_SK || xSk.length !== SIZES.X_SK) {
    throw new CryptoError('ukuran kunci rahasia tidak valid');
  }
  const plaintext = concatBytes(edSk, xSk);
  try {
    return aeadEncrypt(vaultKey, plaintext, LABELS.VAULT_BLOB);
  } finally {
    wipe(plaintext);
  }
}

/** Buka vault. Melempar CryptoError jika password salah atau vault rusak. Pemanggil wajib wipe edSk & xSk. */
export function openVault(
  vaultKey: Uint8Array,
  vault: Uint8Array,
): { edSk: Uint8Array; xSk: Uint8Array } {
  if (vault.length !== VAULT_BYTES) throw new CryptoError('ukuran vault tidak valid');
  const plaintext = aeadDecrypt(vaultKey, vault, LABELS.VAULT_BLOB);
  try {
    return {
      edSk: plaintext.slice(0, SIZES.ED_SK),
      xSk: plaintext.slice(SIZES.ED_SK, SIZES.ED_SK + SIZES.X_SK),
    };
  } finally {
    wipe(plaintext);
  }
}
