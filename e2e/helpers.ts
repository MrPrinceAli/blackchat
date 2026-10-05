import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

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
    const text = message.text();
    // - Kegagalan koneksi WebSocket saat relay sengaja menolak (akun hangus) bukan bug aplikasi.
    // - "Failed to load resource" dicatat browser untuk setiap respons >= 400; dinilai lewat listener response.
    const ignored =
      text.includes('WebSocket connection') || text.startsWith('Failed to load resource');
    if (message.type() === 'error' && !ignored) problems.push(`console: ${text}`);
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    // 404 lookup = username tersedia / tidak ditemukan; itu jawaban API yang sah.
    const expected =
      response.status() === 404 &&
      url.origin === RELAY &&
      url.pathname.startsWith('/v1/account/lookup/');
    if (response.status() >= 400 && !expected)
      problems.push(`respons ${response.status()}: ${url.pathname}`);
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

// ================================================================ dua pengguna (W8)

export interface User {
  context: BrowserContext;
  page: Page;
  username: string;
}

/** Pengguna baru di browser context terpisah (cookie/storage/IndexedDB sendiri). */
export async function newUser(
  browser: Browser,
  viewport?: { width: number; height: number },
  prefix = 'u',
): Promise<User> {
  // Viewport mengikuti project yang sedang berjalan (320 px atau desktop).
  const size = viewport ?? test.info().project.use.viewport ?? { width: 1280, height: 800 };
  const context = await browser.newContext({ viewport: size, baseURL: WEB });
  const page = await context.newPage();
  const username = await registerViaUi(page, uniqueName(prefix));
  return { context, page, username };
}

/** Mulai percakapan dari Home dengan timer tertentu. */
export async function startChat(page: Page, peer: string, ttl: 3 | 5 | 7 | 10 = 3): Promise<void> {
  await page.getByLabel('Cari username').fill(peer);
  await page.getByLabel('Cari username').press('Enter');
  // Percakapan yang sudah ada langsung dibuka; selain itu muncul panel pilih timer.
  const start = page.getByRole('button', { name: 'Mulai percakapan' });
  const header = page.getByRole('button', { name: 'Menu percakapan' });
  await expect(start.or(header)).toBeVisible();
  if (await start.isVisible()) {
    await page.getByText(`${ttl} dtk`, { exact: true }).click();
    await start.click();
  }
  await expect(page.getByText(`@${peer}`, { exact: true })).toBeVisible();
}

export async function send(page: Page, text: string): Promise<void> {
  await page.getByLabel('Tulis pesan').fill(text);
  await page.getByRole('button', { name: 'Kirim' }).click();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  // Terkirim (bukan lagi "Mengirim...").
  await expect(page.getByText('Mengirim...')).toHaveCount(0);
}

/**
 * Buka room dengan `peer` dari daftar. Setelah refresh, aplikasi bisa membuka ulang room terakhir sendiri;
 * dalam kasus itu klik tidak diperlukan (dan tombol daftar bisa hilang di tengah klik).
 */
export async function openRoomWith(page: Page, peer: string): Promise<void> {
  const composer = page.getByLabel('Tulis pesan');
  const room = page.getByRole('button', { name: new RegExp(`^@${peer}`) });
  await expect(composer.or(room)).toBeVisible();
  if (!(await composer.isVisible())) await room.click({ timeout: 5_000 }).catch(() => undefined);
  await expect(composer).toBeVisible();
  await expect(page.getByText(`@${peer}`, { exact: true })).toBeVisible();
}

export async function logout(page: Page): Promise<void> {
  // Kembali sampai Home (bisa dari Verify → Chat → Home).
  for (
    let i = 0;
    i < 3 && !(await page.getByRole('button', { name: 'Pengaturan' }).isVisible());
    i++
  ) {
    await page.getByRole('button', { name: 'Kembali' }).click();
  }
  await page.getByRole('button', { name: 'Pengaturan' }).click();
  await page.getByRole('button', { name: 'Keluar' }).click();
  await expect(page.getByRole('heading', { name: 'blackchat' })).toBeVisible();
}
