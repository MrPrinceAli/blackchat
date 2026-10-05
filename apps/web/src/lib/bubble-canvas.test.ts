import { describe, expect, it } from 'vitest';
import { wrapText } from './bubble-canvas';

const measure = (s: string): number => s.length;

describe('wrapText', () => {
  it('memecah di spasi', () => {
    expect(wrapText('jam 8 di tempat biasa', 10, measure)).toEqual(['jam 8 di', 'tempat', 'biasa']);
  });

  it('memotong kata yang lebih panjang dari satu baris', () => {
    expect(wrapText('abcdefghij', 4, measure)).toEqual(['abcd', 'efgh', 'ij']);
    expect(wrapText('ab abcdefgh', 4, measure)).toEqual(['ab', 'abcd', 'efgh']);
  });

  it('mempertahankan baris baru dan teks kosong', () => {
    expect(wrapText('a\nb', 10, measure)).toEqual(['a', 'b']);
    expect(wrapText('', 10, measure)).toEqual(['']);
  });

  it('tidak pernah menghasilkan baris lebih lebar dari batas (kecuali satu karakter)', () => {
    const text =
      'pesan panjang yang terbungkus beberapa baris supaya efeknya terlihat jelas sekali';
    for (const width of [5, 9, 17, 30]) {
      for (const line of wrapText(text, width, measure))
        expect(line.length).toBeLessThanOrEqual(width);
    }
  });
});
