import { ACCOUNT, ARGON2, codePointLength, LABELS, utf8Encode } from '@blackchat/protocol';
import { randomBytes, wipe } from './bytes.js';
import { COMMON_PASSWORDS } from './common-passwords.js';
import { deriveKey } from './hash.js';
import { CryptoError, sodium } from './sodium.js';

export interface PasswordKeys {
  /** Dikirim ke server saat login; server menyimpan SHA-256-nya. */
  authKey: Uint8Array;
  /** Tidak pernah meninggalkan browser (PRD §4.3). */
  vaultKey: Uint8Array;
}

export function newSalt(): Uint8Array {
  return randomBytes(ARGON2.SALT_BYTES);
}

/** Password dinormalisasi NFC agar sama di semua perangkat/keyboard (D-010). */
const passwordBytes = (password: string): Uint8Array => utf8Encode(password.normalize('NFC'));

/**
 * master = Argon2id(password, salt, 64 byte) dengan parameter D-002;
 * authKey = BLAKE2b-256(key=master, "bc-auth-v1"); vaultKey = BLAKE2b-256(key=master, "bc-vault-v1").
 * Pemanggil wajib wipe kedua kunci setelah tidak dipakai.
 */
export function deriveKeys(password: string, salt: Uint8Array): PasswordKeys {
  if (salt.length !== ARGON2.SALT_BYTES) throw new CryptoError('salt harus 16 byte');
  if (password.length === 0) throw new CryptoError('password kosong');
  const s = sodium();
  const pw = passwordBytes(password);
  let master: Uint8Array | undefined;
  try {
    master = s.crypto_pwhash(
      ARGON2.MASTER_BYTES,
      pw,
      salt,
      ARGON2.OPSLIMIT,
      ARGON2.MEMLIMIT,
      s.crypto_pwhash_ALG_ARGON2ID13,
    );
    return { authKey: deriveKey(master, LABELS.AUTH), vaultKey: deriveKey(master, LABELS.VAULT) };
  } finally {
    wipe(pw, master);
  }
}

export type PasswordProblem = 'too_short' | 'same_as_username' | 'common';

/** Aturan password PRD §4.3: ≥ 10 karakter, bukan username, bukan password umum. */
export function checkPasswordPolicy(username: string, password: string): PasswordProblem | null {
  const normalized = password.normalize('NFC');
  if (codePointLength(normalized) < ACCOUNT.PASSWORD_MIN_CHARS) return 'too_short';
  const lower = normalized.toLowerCase();
  if (lower === username.toLowerCase()) return 'same_as_username';
  if (COMMON_PASSWORDS.has(lower)) return 'common';
  return null;
}
