import { afterEach, describe, expect, it } from 'vitest';
import { advanceClock, now, resetClock } from '../src/clock.js';

describe('clock (D-006)', () => {
  afterEach(() => resetClock());

  it('mengikuti waktu nyata tanpa offset', () => {
    expect(Math.abs(now() - Date.now())).toBeLessThan(50);
  });

  it('bisa dimajukan di build test', () => {
    advanceClock(72 * 3_600_000);
    expect(now() - Date.now()).toBeGreaterThanOrEqual(72 * 3_600_000 - 50);
  });

  it('menolak offset negatif', () => {
    expect(() => advanceClock(-1)).toThrow(RangeError);
  });
});
