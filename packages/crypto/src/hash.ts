import { utf8Encode } from '@blackchat/protocol';
import { sodium } from './sodium.js';

/** BLAKE2b dengan panjang output `length` (16–64), opsional dengan kunci (16–64 byte). */
export function blake2b(length: number, message: Uint8Array, key?: Uint8Array): Uint8Array {
  return sodium().crypto_generichash(length, message, key ?? null);
}

/** BLAKE2b-256(key, utf8(label)) — turunan kunci berlabel (PRD §4.3, §4.6). */
export function deriveKey(key: Uint8Array, label: string): Uint8Array {
  return blake2b(32, utf8Encode(label), key);
}
