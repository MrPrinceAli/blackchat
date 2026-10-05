import { describe, expect, it } from 'vitest';
import { accountWarning, formatAccountClock } from './clock';

const S = 1000;
const M = 60 * S;
const H = 60 * M;
const D = 24 * H;

describe('formatAccountClock (PRD §10.3)', () => {
  it('format hari-jam-menit', () => {
    expect(formatAccountClock(2 * D + 14 * H + 3 * M + 59 * S)).toBe('2h 14j 03m');
    expect(formatAccountClock(72 * H)).toBe('3h 00j 00m');
    expect(formatAccountClock(1 * D)).toBe('1h 00j 00m');
  });

  it('di bawah sehari: jam-menit', () => {
    expect(formatAccountClock(23 * H + 59 * M + 59 * S)).toBe('23j 59m');
    expect(formatAccountClock(1 * H)).toBe('01j 00m');
  });

  it('di bawah 1 jam: menit-detik', () => {
    expect(formatAccountClock(59 * M + 12 * S + 999)).toBe('59m 12d');
    expect(formatAccountClock(5 * S)).toBe('00m 05d');
    expect(formatAccountClock(0)).toBe('00m 00d');
    expect(formatAccountClock(-5000)).toBe('00m 00d');
  });
});

describe('accountWarning (PRD §10.3)', () => {
  it('muncul di 24 jam, 1 jam, dan 5 menit terakhir', () => {
    expect(accountWarning(25 * H)).toBeNull();
    expect(accountWarning(24 * H)).toContain('24 jam');
    expect(accountWarning(2 * H)).toContain('24 jam');
    expect(accountWarning(1 * H)).toContain('1 jam');
    expect(accountWarning(5 * M)).toContain('5 menit');
    expect(accountWarning(1 * S)).toContain('5 menit');
    expect(accountWarning(0)).toBeNull();
  });

  it('teks lengkap sesuai PRD', () => {
    expect(accountWarning(1 * H)).toBe('Akun hangus dalam 1 jam. Semua pesan ikut terhapus.');
  });
});
