import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const WEB = 'http://localhost:4173';
export const RELAY = 'http://localhost:8787';
export const PASSWORD = 'kuda lumping 2026';

/** Username unik per test (relay dipakai bersama sepanjang run). */
export function uniqueName(prefix = 'u'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`.slice(
    0,
    20,
  );
}

/** Route khusus test relay (D-006). Tanpa Origin, jadi tidak terkena CORS. */
export const relay = {
  resetLimits: (request: APIRequestContext) =>
    request.post(`${RELAY}/__test/reset-limits`, { data: {} }),
  advanceClock: (request: APIRequestContext, ms: number) =>
    request.post(`${RELAY}/__test/clock`, { data: { advanceMs: ms } }),
  resetClock: (request: APIRequestContext) =>
    request.post(`${RELAY}/__test/clock`, { data: { reset: true } }),
};

/**
 * Kumpulkan error konsol, error halaman, request ke luar origin web & relay, dan pelanggaran CSP.
 * Mengembalikan fungsi pemeriksa.
 */
export async function watch(page: Page): Promise<() => Promise<void>> {
  const problems: string[] = [];
  const allowed = new Set([WEB, RELAY, RELAY.replace('http', 'ws')]);
  page.on('console', (message) => {
    // Kegagalan koneksi WebSocket saat relay sengaja menolak (akun hangus) bukan bug aplikasi.
    if (message.type() === 'error' && !message.text().includes('WebSocket connection'))
      problems.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('request', (request) => {
    if (!allowed.has(new URL(request.url()).origin))
      problems.push(`request keluar origin: ${request.url()}`);
  });
  page.on('websocket', (ws) => {
    if (!allowed.has(new URL(ws.url()).origin))
      problems.push(`websocket keluar origin: ${ws.url()}`);
  });
  await page.addInitScript(() => {
    const store: string[] = [];
    Object.defineProperty(window, '__csp', { value: store, configurable: true });
    document.addEventListener('securitypolicyviolation', (event) =>
      store.push(`${event.violatedDirective} ${event.blockedURI}`),
    );
  });
  return async () => {
    const csp = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
    expect(csp, 'pelanggaran CSP').toEqual([]);
    expect(problems, 'error/request tak terduga').toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'scroll horizontal').toBeLessThanOrEqual(0);
  };
}

export async function registerViaUi(page: Page, username = uniqueName()): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Buat akun' }).click();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Ulangi password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Buat akun' }).click();
  await expect(page.getByText(`@${username}`)).toBeVisible({ timeout: 20_000 });
  return username;
}

export async function loginViaUi(page: Page, username: string, password = PASSWORD): Promise<void> {
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
}

/** Jumlah entri sesi di IndexedDB `sessions` dan kunci bc.* di sessionStorage (PRD §15.2). */
export function sessionFootprint(page: Page): Promise<{ idb: number; tab: number }> {
  return page.evaluate(async () => {
    const tab = Object.keys(sessionStorage).filter((k) => k.startsWith('bc.')).length;
    const idb = await new Promise<number>((resolve) => {
      const open = indexedDB.open('blackchat', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('sessions');
      open.onsuccess = () => {
        const count = open.result
          .transaction('sessions', 'readonly')
          .objectStore('sessions')
          .count();
        count.onsuccess = () => resolve(count.result);
      };
    });
    return { idb, tab };
  });
}
