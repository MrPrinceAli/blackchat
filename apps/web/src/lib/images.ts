// Pemrosesan gambar sebelum dikirim (PRD §7.5): decode → gambar ulang ke canvas → sisi terpanjang maks 1600 px →
// WebP 0,8 (fallback JPEG 0,85) → turunkan kualitas/ukuran bertahap sampai ≤ 1,5 MB.
// Menggambar ulang ke canvas menghapus seluruh metadata (EXIF, termasuk lokasi GPS).
import { IMAGE } from '@blackchat/protocol';

export type ImageErrorCode = 'too_large' | 'unsupported' | 'undecodable';

export class ImageError extends Error {
  override readonly name = 'ImageError';
  constructor(readonly code: ImageErrorCode) {
    super(code);
  }
}

export interface ProcessedImage {
  bytes: Uint8Array;
  w: number;
  h: number;
  mime: 'image/webp' | 'image/jpeg';
}

/** Ukuran baru dengan sisi terpanjang ≤ maxEdge, rasio dipertahankan. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = IMAGE.MAX_EDGE_PX,
): { w: number; h: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

/** Langkah kualitas yang dicoba berurutan untuk satu format. */
export function qualitySteps(start: number): number[] {
  const steps: number[] = [];
  for (let q = start; q >= 0.4 - 1e-9; q -= 0.1) steps.push(Math.round(q * 100) / 100);
  return steps;
}

function toBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
}

export async function processImage(file: Blob): Promise<ProcessedImage> {
  if (file.size > IMAGE.INPUT_MAX_BYTES) throw new ImageError('too_large');
  if (file.type && !(IMAGE.INPUT_MIME as readonly string[]).includes(file.type))
    throw new ImageError('unsupported');

  let bitmap: ImageBitmap;
  try {
    // HEIC hanya bisa jika browser mampu men-decode-nya.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ImageError('undecodable');
  }

  try {
    let { w, h } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    for (let attempt = 0; attempt < 4; attempt++) {
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new ImageError('undecodable');
      ctx.drawImage(bitmap, 0, 0, w, h);
      for (const [mime, start] of [
        ['image/webp', IMAGE.WEBP_QUALITY],
        ['image/jpeg', IMAGE.JPEG_QUALITY],
      ] as const) {
        for (const quality of qualitySteps(start)) {
          const blob = await toBlob(canvas, mime, quality);
          // Browser tanpa encoder WebP mengembalikan PNG: lanjut ke JPEG.
          if (!blob || blob.type !== mime) break;
          if (blob.size <= IMAGE.OUTPUT_MAX_BYTES) {
            const bytes = new Uint8Array(await blob.arrayBuffer());
            ctx.clearRect(0, 0, w, h);
            return { bytes, w, h, mime };
          }
        }
      }
      // Masih terlalu besar di kualitas terendah: perkecil dimensi.
      ({ w, h } = fitWithin(w, h, Math.round(Math.max(w, h) * 0.8)));
    }
    throw new ImageError('too_large');
  } finally {
    bitmap.close();
  }
}

/** Tinggi tampilan maks 60% layar, lebar menyesuaikan rasio dan lebar kolom (PRD §7.2). */
export function displaySize(
  w: number,
  h: number,
  maxWidth: number,
  viewportHeight: number,
): { width: number; height: number } {
  const maxHeight = viewportHeight * IMAGE.MAX_VIEWPORT_HEIGHT;
  const scale = Math.min(1, maxWidth / w, maxHeight / h);
  // Dibulatkan ke bawah agar tidak pernah melewati batas 60% tinggi layar.
  return { width: Math.max(1, Math.floor(w * scale)), height: Math.max(1, Math.floor(h * scale)) };
}
