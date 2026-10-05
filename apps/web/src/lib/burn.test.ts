import { describe, expect, it } from 'vitest';
import { BURN, heightFactor, particleAt, particlesFrom, type PixelSource } from './burn';

function source(
  width: number,
  height: number,
  fill: (x: number, y: number) => [number, number, number, number],
): PixelSource {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data.set(fill(x, y), (y * width + x) * 4);
  return { width, height, data };
}

describe('efek lebur (PRD §10.4)', () => {
  it('satu partikel per sel 4×4; sel transparan dilewati', () => {
    const src = source(16, 8, (x) => (x < 8 ? [255, 255, 255, 255] : [0, 0, 0, 0]));
    const particles = particlesFrom(src, () => 0.5);
    expect(particles).toHaveLength(2 * 2); // 2 kolom × 2 baris sel terisi
    expect(particles.every((p) => p.x < 8 && p.r === 255 && p.a === 1)).toBe(true);
  });

  it('delay 0–200 ms dan jatuh 8–24 px', () => {
    const src = source(40, 40, () => [0, 0, 0, 255]);
    for (const p of particlesFrom(src)) {
      expect(p.delay).toBeGreaterThanOrEqual(0);
      expect(p.delay).toBeLessThan(BURN.MAX_DELAY_MS);
      expect(p.fall).toBeGreaterThanOrEqual(BURN.FALL_MIN_PX);
      expect(p.fall).toBeLessThan(BURN.FALL_MAX_PX);
    }
  });

  it('partikel memudar sambil jatuh dan habis di akhir fase partikel', () => {
    const p = { x: 0, y: 0, r: 0, g: 0, b: 0, a: 1, delay: 100, fall: 20 };
    expect(particleAt(p, 0)).toEqual({ alpha: 1, dy: 0 });
    expect(particleAt(p, 100)).toEqual({ alpha: 1, dy: 0 });
    const mid = particleAt(p, 250);
    expect(mid.alpha).toBeGreaterThan(0);
    expect(mid.alpha).toBeLessThan(1);
    expect(mid.dy).toBeGreaterThan(0);
    expect(particleAt(p, BURN.PARTICLE_PHASE_MS)).toEqual({ alpha: 0, dy: 20 });
  });

  it('tinggi area menyusut ke 0 tepat di 600 ms', () => {
    expect(BURN.DURATION_MS).toBe(600);
    expect(heightFactor(0)).toBe(1);
    expect(heightFactor(BURN.PARTICLE_PHASE_MS)).toBe(1);
    expect(heightFactor(525)).toBeCloseTo(0.5);
    expect(heightFactor(600)).toBe(0);
    expect(heightFactor(700)).toBe(0);
  });
});
