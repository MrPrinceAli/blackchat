import { concatBytes, SIZES } from '@blackchat/protocol';
import { blake2b } from './hash.js';
import { CryptoError, sodium } from './sodium.js';

const GROUPS = 12;
const DIGITS_PER_GROUP = 5;
const MODULUS = 10n ** BigInt(GROUPS * DIGITS_PER_GROUP);

/**
 * Safety number = BLAKE2b-256(sort(edPkA, edPkB)) → 60 digit dalam 12 grup × 5 (PRD §4.4).
 * Hash 256-bit dibaca sebagai bilangan big-endian lalu diambil 60 digit terakhirnya
 * (bias modulo diabaikan: 2^256 ≫ 10^60). Simetris: urutan argumen tidak berpengaruh.
 */
export function safetyNumber(edPkA: Uint8Array, edPkB: Uint8Array): string[] {
  if (edPkA.length !== SIZES.ED_PK || edPkB.length !== SIZES.ED_PK) {
    throw new CryptoError('edPk harus 32 byte');
  }
  const [first, second] = sodium().compare(edPkA, edPkB) <= 0 ? [edPkA, edPkB] : [edPkB, edPkA];
  const hash = blake2b(SIZES.SAFETY_HASH, concatBytes(first, second));
  let value = 0n;
  for (const byte of hash) value = (value << 8n) | BigInt(byte);
  const digits = (value % MODULUS).toString().padStart(GROUPS * DIGITS_PER_GROUP, '0');
  return Array.from({ length: GROUPS }, (_, i) =>
    digits.slice(i * DIGITS_PER_GROUP, (i + 1) * DIGITS_PER_GROUP),
  );
}
