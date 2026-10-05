// BLAKE2b relay memakai @noble/hashes (D-007); hasilnya wajib identik dengan libsodium di client
// (diuji terhadap vektor packages/crypto/test/*.json). SHA-256 lewat WebCrypto.
import { blake2b as nobleBlake2b } from '@noble/hashes/blake2.js';
import { base32CrockfordEncode, hexDecode, LABELS, SIZES, utf8Encode } from '@blackchat/protocol';
import type { Env } from './env.js';

export function blake2b(length: number, message: Uint8Array, key?: Uint8Array): Uint8Array {
  return key
    ? nobleBlake2b(message, { dkLen: length, key })
    : nobleBlake2b(message, { dkLen: length });
}

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}

/** userId = base32-crockford(BLAKE2b-160(edPk)) (PRD §4.2). */
export function userIdFromEdPk(edPk: Uint8Array): string {
  return base32CrockfordEncode(blake2b(SIZES.USER_ID_HASH, edPk));
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

let cachedSecret: { raw: string; bytes: Uint8Array } | undefined;

/** SALT_SECRET wajib 32 byte hex. Tanpa itu relay menolak bekerja (fail closed). */
export function saltSecret(env: Env): Uint8Array {
  if (cachedSecret?.raw === env.SALT_SECRET) return cachedSecret.bytes;
  if (typeof env.SALT_SECRET !== 'string' || !/^[0-9a-f]{64}$/.test(env.SALT_SECRET)) {
    throw new ConfigError('SALT_SECRET harus 32 byte hex');
  }
  cachedSecret = { raw: env.SALT_SECRET, bytes: hexDecode(env.SALT_SECRET) };
  return cachedSecret.bytes;
}

/** Salt palsu deterministik untuk username yang tidak ada (PRD §5.2). */
export function fakeSalt(env: Env, username: string): Uint8Array {
  return blake2b(16, utf8Encode(LABELS.FAKE_SALT + username), saltSecret(env));
}
