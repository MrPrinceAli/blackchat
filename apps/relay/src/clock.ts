// Satu-satunya sumber waktu relay (D-006). Di build produksi offset selalu 0
// dan advance() tidak bisa dipanggil.

let offsetMs = 0;

export function now(): number {
  return Date.now() + offsetMs;
}

/** Hanya untuk test: majukan jam relay. */
export function advanceClock(ms: number): void {
  if (!__BC_TEST__) throw new Error('advanceClock hanya tersedia di build test');
  if (!Number.isFinite(ms) || ms < 0) throw new RangeError('ms harus angka ≥ 0');
  offsetMs += ms;
}

/** Hanya untuk test: kembalikan jam ke waktu nyata. */
export function resetClock(): void {
  if (!__BC_TEST__) throw new Error('resetClock hanya tersedia di build test');
  offsetMs = 0;
}
