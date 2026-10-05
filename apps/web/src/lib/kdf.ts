import type { PasswordKeys } from '@blackchat/crypto';

type Reply = { ok: true; authKey: Uint8Array; vaultKey: Uint8Array } | { ok: false };

/** Durasi Argon2id terakhir (ms), untuk diukur di E2E (PRD W7). */
export let lastKdfMs = 0;

/** Turunkan authKey & vaultKey di worker terpisah. Pemanggil wajib wipe hasilnya. */
export function deriveKeysInWorker(password: string, salt: Uint8Array): Promise<PasswordKeys> {
  const worker = new Worker(new URL('./kdf.worker.ts', import.meta.url), { type: 'module' });
  const started = performance.now();
  return new Promise((resolve, reject) => {
    worker.addEventListener('message', (event: MessageEvent<Reply>) => {
      worker.terminate();
      lastKdfMs = performance.now() - started;
      performance.measure?.('bc-kdf', { start: started, duration: lastKdfMs });
      if (event.data.ok) resolve({ authKey: event.data.authKey, vaultKey: event.data.vaultKey });
      else reject(new Error('Argon2id gagal'));
    });
    worker.addEventListener('error', () => {
      worker.terminate();
      reject(new Error('worker Argon2id gagal dimuat'));
    });
    worker.postMessage({ password, salt });
  });
}
