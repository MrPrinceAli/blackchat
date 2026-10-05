import { describe, expect, it } from 'vitest';
import { displaySize, fitWithin, qualitySteps } from './images';

describe('ukuran gambar (PRD §7.2, §7.5)', () => {
  it('sisi terpanjang maks 1600 px, rasio dipertahankan, tidak diperbesar', () => {
    expect(fitWithin(4000, 3000)).toEqual({ w: 1600, h: 1200 });
    expect(fitWithin(1000, 4000)).toEqual({ w: 400, h: 1600 });
    expect(fitWithin(800, 600)).toEqual({ w: 800, h: 600 });
  });

  it('langkah kualitas menurun 0,1 sampai 0,4', () => {
    expect(qualitySteps(0.8)).toEqual([0.8, 0.7, 0.6, 0.5, 0.4]);
    expect(qualitySteps(0.85)).toEqual([0.85, 0.75, 0.65, 0.55, 0.45]);
  });

  it('tinggi tampilan maks 60% layar agar syarat 50% terlihat selalu bisa terpenuhi', () => {
    const portrait = displaySize(400, 1600, 272, 568);
    expect(portrait.height).toBeLessThanOrEqual(568 * 0.6);
    expect(portrait.width / portrait.height).toBeCloseTo(400 / 1600, 1);
    expect(displaySize(1600, 900, 272, 568).width).toBeLessThanOrEqual(272);
    expect(displaySize(100, 50, 272, 568)).toEqual({ width: 100, height: 50 });
  });
});
