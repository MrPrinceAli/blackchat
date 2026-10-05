// Dijalankan di Chromium sungguhan: pemrosesan gambar menghapus EXIF/GPS (PRD §7.5, §15.2).
import { IMAGE } from '@blackchat/protocol';
import { describe, expect, it } from 'vitest';
import { ImageError, processImage } from './images';

/** Blok APP1 EXIF minimal dengan GPS IFD (lintang 6°10'S, bujur 106°49'E). */
function exifWithGps(): Uint8Array<ArrayBuffer> {
  const tiff: number[] = [];
  const u16 = (n: number) => tiff.push(n & 0xff, (n >> 8) & 0xff);
  const u32 = (n: number) =>
    tiff.push(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff);
  // Header TIFF little-endian, IFD0 di offset 8.
  tiff.push(0x49, 0x49);
  u16(42);
  u32(8);
  // IFD0: 1 entri GPSInfo (0x8825, LONG) → GPS IFD di offset 26.
  u16(1);
  u16(0x8825);
  u16(4);
  u32(1);
  u32(26);
  u32(0);
  // GPS IFD: LatitudeRef 'S', Latitude (3 RATIONAL di offset 68), LongitudeRef 'E', Longitude (offset 92).
  const entry = (tag: number, type: number, count: number, value: number[] | number) => {
    u16(tag);
    u16(type);
    u32(count);
    if (Array.isArray(value)) tiff.push(...value);
    else u32(value);
  };
  u16(4);
  entry(1, 2, 2, [0x53, 0, 0, 0]);
  entry(2, 5, 3, 68);
  entry(3, 2, 2, [0x45, 0, 0, 0]);
  entry(4, 5, 3, 92);
  u32(0);
  for (const [n, d] of [
    [6, 1],
    [10, 1],
    [0, 1],
    [106, 1],
    [49, 1],
    [0, 1],
  ] as const) {
    u32(n);
    u32(d);
  }
  const payload = [...new TextEncoder().encode('Exif'), 0, 0, ...tiff];
  const length = payload.length + 2;
  return Uint8Array.from([0xff, 0xe1, length >> 8, length & 0xff, ...payload]);
}

async function jpegWithGps(width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  // Pola acak supaya kompresi tidak terlalu mudah (ukuran mendekati foto sungguhan).
  const pixels = ctx.createImageData(width, height);
  for (let i = 0; i < pixels.data.length; i++) pixels.data[i] = (i * 2654435761) % 256;
  ctx.putImageData(pixels, 0, 0);
  const base = new Uint8Array(
    await (
      await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/jpeg', 0.95))
    ).arrayBuffer(),
  );
  // Sisipkan APP1 EXIF tepat setelah SOI (FFD8).
  return new Blob([base.slice(0, 2), exifWithGps(), base.slice(2)], { type: 'image/jpeg' });
}

const contains = (haystack: Uint8Array, needle: string): boolean => {
  const n = new TextEncoder().encode(needle);
  outer: for (let i = 0; i <= haystack.length - n.length; i++) {
    for (let j = 0; j < n.length; j++) if (haystack[i + j] !== n[j]) continue outer;
    return true;
  }
  return false;
};

describe('processImage di browser (PRD §7.5)', () => {
  it('menghapus EXIF termasuk GPS, sisi terpanjang ≤ 1600 px, ukuran ≤ 1,5 MB', async () => {
    const input = await jpegWithGps(3000, 2000);
    const inputBytes = new Uint8Array(await input.arrayBuffer());
    expect(contains(inputBytes, 'Exif')).toBe(true); // fixture memang membawa EXIF

    const out = await processImage(input);
    expect(Math.max(out.w, out.h)).toBe(IMAGE.MAX_EDGE_PX);
    expect(out.w / out.h).toBeCloseTo(1.5, 2);
    expect(out.bytes.length).toBeLessThanOrEqual(IMAGE.OUTPUT_MAX_BYTES);
    expect(['image/webp', 'image/jpeg']).toContain(out.mime);
    expect(contains(out.bytes, 'Exif')).toBe(false);
    expect(contains(out.bytes, 'EXIF')).toBe(false);
    // Hasil bisa di-decode lagi sebagai gambar.
    const bitmap = await createImageBitmap(new Blob([out.bytes.slice()], { type: out.mime }));
    expect([bitmap.width, bitmap.height]).toEqual([out.w, out.h]);
    bitmap.close();
  });

  it('menolak input > 15 MB, format tak didukung, dan data yang bukan gambar', async () => {
    const huge = new Blob([new Uint8Array(IMAGE.INPUT_MAX_BYTES + 1)], { type: 'image/jpeg' });
    await expect(processImage(huge)).rejects.toEqual(new ImageError('too_large'));
    await expect(
      processImage(new Blob([new Uint8Array(10)], { type: 'image/gif' })),
    ).rejects.toEqual(new ImageError('unsupported'));
    await expect(
      processImage(new Blob([new Uint8Array(100).fill(7)], { type: 'image/jpeg' })),
    ).rejects.toEqual(new ImageError('undecodable'));
  });
});
