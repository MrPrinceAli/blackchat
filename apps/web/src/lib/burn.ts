// Mesin efek lebur (PRD §10.4): area bubble dipecah menjadi grid piksel 4 px; setiap piksel memudar dengan
// delay acak sambil jatuh 8–24 px, lalu area menyusut tingginya ke 0. Total 600 ms; reduced-motion: fade 200 ms.
// Fungsi murni (tanpa DOM) supaya bisa diuji.
import { MESSAGE } from '@blackchat/protocol';

export const BURN = {
  DURATION_MS: MESSAGE.BURN_ANIMATION_MS,
  REDUCED_MS: MESSAGE.BURN_REDUCED_MOTION_MS,
  CELL_PX: 4,
  /** Fase partikel; sisa durasi untuk menyusutkan tinggi. */
  PARTICLE_PHASE_MS: 450,
  MAX_DELAY_MS: 200,
  FALL_MIN_PX: 8,
  FALL_MAX_PX: 24,
} as const;

export interface Particle {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  /** Alfa awal 0–1. */
  a: number;
  delay: number;
  fall: number;
}

export interface PixelSource {
  width: number;
  height: number;
  /** RGBA, panjang width × height × 4. */
  data: Uint8ClampedArray;
}

/** Ambil satu partikel per sel 4×4 dari piksel tengah sel; sel transparan dilewati. */
export function particlesFrom(
  source: PixelSource,
  random: () => number = Math.random,
  cell: number = BURN.CELL_PX,
): Particle[] {
  const particles: Particle[] = [];
  const half = Math.floor(cell / 2);
  for (let y = 0; y < source.height; y += cell) {
    for (let x = 0; x < source.width; x += cell) {
      const sx = Math.min(x + half, source.width - 1);
      const sy = Math.min(y + half, source.height - 1);
      const i = (sy * source.width + sx) * 4;
      const alpha = source.data[i + 3]!;
      if (alpha === 0) continue;
      particles.push({
        x,
        y,
        r: source.data[i]!,
        g: source.data[i + 1]!,
        b: source.data[i + 2]!,
        a: alpha / 255,
        delay: random() * BURN.MAX_DELAY_MS,
        fall: BURN.FALL_MIN_PX + random() * (BURN.FALL_MAX_PX - BURN.FALL_MIN_PX),
      });
    }
  }
  return particles;
}

const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

/** Keadaan satu partikel pada waktu `elapsed` ms sejak efek mulai. */
export function particleAt(p: Particle, elapsed: number): { alpha: number; dy: number } {
  const span = BURN.PARTICLE_PHASE_MS - p.delay;
  const local = clamp01((elapsed - p.delay) / span);
  const eased = easeOut(local);
  return { alpha: p.a * (1 - eased), dy: p.fall * eased };
}

/** Faktor tinggi area (1 → 0) pada fase akhir. */
export function heightFactor(elapsed: number): number {
  if (elapsed <= BURN.PARTICLE_PHASE_MS) return 1;
  return (
    1 - clamp01((elapsed - BURN.PARTICLE_PHASE_MS) / (BURN.DURATION_MS - BURN.PARTICLE_PHASE_MS))
  );
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
