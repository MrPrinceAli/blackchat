import sodiumModule from 'libsodium-wrappers-sumo';

export type Sodium = typeof sodiumModule;

let ready: Promise<Sodium> | undefined;

/** Satu inisialisasi libsodium bersama untuk seluruh paket. */
export function getSodium(): Promise<Sodium> {
  ready ??= sodiumModule.ready.then(() => sodiumModule);
  return ready;
}
