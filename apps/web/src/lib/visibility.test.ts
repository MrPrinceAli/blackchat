import { describe, expect, it } from 'vitest';
import { isEnoughVisible } from './visibility';

describe('syarat "dilihat" (PRD §7.2)', () => {
  it('minimal 50% bubble di viewport', () => {
    expect(
      isEnoughVisible({ ratio: 0.5, visibleHeight: 50, elementHeight: 100, viewportHeight: 568 }),
    ).toBe(true);
    expect(
      isEnoughVisible({ ratio: 0.49, visibleHeight: 49, elementHeight: 100, viewportHeight: 568 }),
    ).toBe(false);
  });

  it('bubble lebih tinggi dari layar: cukup menutupi separuh tinggi layar', () => {
    // Teks 2000 karakter di layar 320×568: tinggi bubble 1300 px, rasio maksimal 568/1300 < 0,5.
    expect(
      isEnoughVisible({
        ratio: 568 / 1300,
        visibleHeight: 568,
        elementHeight: 1300,
        viewportHeight: 568,
      }),
    ).toBe(true);
    expect(
      isEnoughVisible({
        ratio: 280 / 1300,
        visibleHeight: 280,
        elementHeight: 1300,
        viewportHeight: 568,
      }),
    ).toBe(false);
  });

  it('tidak terlihat sama sekali → false', () => {
    expect(
      isEnoughVisible({ ratio: 0, visibleHeight: 0, elementHeight: 100, viewportHeight: 568 }),
    ).toBe(false);
  });
});
