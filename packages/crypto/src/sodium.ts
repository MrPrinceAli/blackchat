import sodiumModule from 'libsodium-wrappers-sumo';

export type Sodium = typeof sodiumModule;

export class CryptoError extends Error {
  override readonly name = 'CryptoError';
}

let instance: Sodium | undefined;
let pending: Promise<void> | undefined;

/** Inisialisasi libsodium sekali. Wajib di-await sebelum memakai fungsi lain di paket ini. */
export function ready(): Promise<void> {
  pending ??= sodiumModule.ready.then(() => {
    instance = sodiumModule;
  });
  return pending;
}

/** libsodium yang sudah siap. Melempar jika ready() belum selesai. */
export function sodium(): Sodium {
  if (!instance) throw new CryptoError('libsodium belum siap: panggil await ready() dulu');
  return instance;
}
