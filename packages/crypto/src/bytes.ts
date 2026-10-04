import { sodium } from './sodium.js';

/** Perbandingan constant-time (PRD §12 aturan 11). Panjang berbeda → false. */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return sodium().memcmp(a, b);
}

/** Hapus isi buffer rahasia (PRD §12 aturan 9). Aman dipanggil dengan undefined. */
export function wipe(...buffers: (Uint8Array | null | undefined)[]): void {
  for (const buffer of buffers) if (buffer) sodium().memzero(buffer);
}

export function randomBytes(length: number): Uint8Array {
  return sodium().randombytes_buf(length);
}
