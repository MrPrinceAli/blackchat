import { describe, expect, it } from 'vitest';
import {
  IMAGE,
  IMAGE_CIPHER_CHUNK_BYTES,
  IMAGE_MAX_CHUNKS,
  LABELS,
  LIMITS,
  MESSAGE,
} from '../src/index.js';

describe('constants', () => {
  it('setiap label unik dan berversi', () => {
    const values = Object.values(LABELS);
    expect(new Set(values).size).toBe(values.length);
    for (const label of values) expect(label).toMatch(/^bc-[a-z0-9-]+-v1$/);
  });

  it('chunk gambar terenkripsi muat dalam satu frame biner', () => {
    expect(IMAGE.CHUNK_BYTES).toBe(262_144);
    expect(IMAGE_CIPHER_CHUNK_BYTES).toBeLessThan(LIMITS.CHUNK_FRAME_MAX_BYTES);
  });

  it('gambar terbesar setelah padding butuh 7 chunk', () => {
    expect(IMAGE_MAX_CHUNKS).toBe(7);
  });

  it('pilihan timer sesuai PRD', () => {
    expect(MESSAGE.TTL_OPTIONS).toEqual([3, 5, 7, 10]);
  });
});
