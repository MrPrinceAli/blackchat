// Chat teks end-to-end dengan dua pengguna di browser context terpisah (PRD §6.3, §7, §8, §15.2).
import { expect, test, type Page } from '@playwright/test';
import {
  logout,
  loginViaUi,
  newUser,
  openRoomWith,
  relay,
  send,
  startChat,
  watch,
  type User,
} from './helpers';

test.beforeEach(async ({ request }) => {
  await relay.resetLimits(request);
  await relay.resetClock(request);
});

test.afterEach(async ({ request }) => {
  await relay.resetClock(request);
});

const bubbleText = (page: Page, text: string) => page.getByText(text, { exact: true });

/** Waktu (ms) dari hitung mundur muncul di `page` sampai teks hilang dari DOM. */
async function timeUntilBurned(page: Page, text: string): Promise<number> {
  await expect(page.getByRole('timer', { name: /detik tersisa/ })).toBeVisible();
  const started = Date.now();
  await expect(bubbleText(page, text)).toHaveCount(0, { timeout: 15_000 });
  return Date.now() - started;
}

async function pair(
  browser: Parameters<typeof newUser>[0],
  viewport?: { width: number; height: number },
) {
  const a = await newUser(browser, viewport, 'a');
  const b = await newUser(browser, viewport, 'b');
  return { a, b };
}

const close = async (...users: User[]) => {
  for (const u of users) await u.context.close();
};

test('A kirim saat B offline; B login kemudian dan menerima (PRD §15.2)', async ({ browser }) => {
  const { a, b } = await pair(browser);
  await logout(b.page);

  await startChat(a.page, b.username, 5);
  await send(a.page, 'jam 8 di tempat biasa');
  await expect(a.page.getByText('Belum dibuka')).toBeVisible();

  await b.page.getByRole('button', { name: 'Masuk' }).click();
  await loginViaUi(b.page, b.username);
  const room = b.page.getByRole('button', { name: new RegExp(`^@${a.username}`) });
  await expect(room).toBeVisible();
  await expect(room.getByLabel('1 belum dibuka')).toBeVisible();
  await openRoomWith(b.page, a.username);
  await expect(bubbleText(b.page, 'jam 8 di tempat biasa')).toBeVisible();
  await close(a, b);
});

test('timer mulai saat terlihat di layar penerima; hilang di kedua sisi setelah ttl ±500 ms, dua arah', async ({
  browser,
}) => {
  const { a, b } = await pair(browser);
  const checkA = await watch(a.page);
  await startChat(a.page, b.username, 3);
  await send(a.page, 'pesan satu');

  // B belum membuka room: timer belum mulai walau lebih dari ttl berlalu.
  await a.page.waitForTimeout(3_800);
  await expect(bubbleText(a.page, 'pesan satu')).toBeVisible();
  await expect(a.page.getByText('Belum dibuka')).toBeVisible();

  await b.page.reload();
  await openRoomWith(b.page, a.username);
  const [elapsedB, elapsedA] = await Promise.all([
    timeUntilBurned(b.page, 'pesan satu'),
    timeUntilBurned(a.page, 'pesan satu'),
  ]);
  // Server: ttl × 1000 + 300 ms (PRD §6.2). Toleransi kriteria ±500 ms.
  for (const elapsed of [elapsedA, elapsedB]) {
    expect(elapsed).toBeGreaterThan(3_300 - 500);
    expect(elapsed).toBeLessThan(3_300 + 500);
  }
  await expect(b.page.getByText('Dilebur')).toBeVisible();

  // Arah sebaliknya: B → A.
  await send(b.page, 'balasan b');
  const [backA, backB] = await Promise.all([
    timeUntilBurned(a.page, 'balasan b'),
    timeUntilBurned(b.page, 'balasan b'),
  ]);
  for (const elapsed of [backA, backB]) {
    expect(elapsed).toBeGreaterThan(3_300 - 500);
    expect(elapsed).toBeLessThan(3_300 + 500);
  }
  await checkA();
  await close(a, b);
});

test('B menutup tab setelah timer mulai → pesan tetap terhapus di server', async ({ browser }) => {
  const { a, b } = await pair(browser);
  await startChat(a.page, b.username, 3);
  await send(a.page, 'rahasia sekali');
  await b.page.reload();
  await openRoomWith(b.page, a.username);
  await expect(b.page.getByRole('timer', { name: /detik tersisa/ })).toBeVisible();
  await b.context.close();

  // A menutup room sebelum lebur lokal terjadi; setelah ttl, sinkron dari server tidak lagi memuat pesan itu.
  await a.page.getByRole('button', { name: 'Kembali' }).click();
  await a.page.waitForTimeout(3_800);
  await openRoomWith(a.page, b.username);
  await a.page.waitForTimeout(500);
  await expect(bubbleText(a.page, 'rahasia sekali')).toHaveCount(0);
  await close(a);
});

test('5 pesan sekaligus: hanya yang pertama terbaca, sisanya menunggu giliran, melebur berurutan', async ({
  browser,
}) => {
  const { a, b } = await pair(browser);
  await startChat(a.page, b.username, 3);
  const texts = ['satu', 'dua', 'tiga', 'empat', 'lima'];
  for (const t of texts) await send(a.page, t);

  await b.page.reload();
  await openRoomWith(b.page, a.username);
  await expect(bubbleText(b.page, 'satu')).toBeVisible();
  for (const t of texts.slice(1)) await expect(bubbleText(b.page, t)).toHaveCount(0);
  await expect(b.page.getByLabel('Menunggu giliran')).toHaveCount(4);

  for (let i = 0; i < texts.length; i++) {
    await expect(bubbleText(b.page, texts[i]!)).toBeVisible({ timeout: 10_000 });
    await expect(b.page.getByLabel('Menunggu giliran')).toHaveCount(texts.length - 1 - i);
    await expect(bubbleText(b.page, texts[i]!)).toHaveCount(0, { timeout: 10_000 });
  }
  await close(a, b);
});

test('pesan berisi HTML tampil sebagai teks di penerima (PRD §15.2)', async ({ browser }) => {
  const { a, b } = await pair(browser);
  let dialog = false;
  b.page.on('dialog', async (d) => {
    dialog = true;
    await d.dismiss();
  });
  const payload = '<img src=x onerror=alert(1)>';
  await startChat(a.page, b.username, 10);
  await send(a.page, payload);
  await b.page.reload();
  await openRoomWith(b.page, a.username);
  await expect(bubbleText(b.page, payload)).toBeVisible();
  await expect(b.page.locator('section img')).toHaveCount(0);
  expect(dialog).toBe(false);
  await close(a, b);
});

test('refresh membuka room yang benar walau urutan daftar berubah; timer tetap akurat', async ({
  browser,
}) => {
  const { a, b } = await pair(browser);
  const c = await newUser(browser, undefined, 'c');
  // B punya dua percakapan.
  await startChat(c.page, b.username, 10);
  await send(c.page, 'dari c');
  await startChat(a.page, b.username, 10);
  await send(a.page, 'dari a');

  await b.page.reload();
  await openRoomWith(b.page, a.username);
  await expect(b.page.getByRole('timer', { name: /detik tersisa/ })).toBeVisible();
  const opened = Date.now();
  // Hitung mundur di pesan sendiri (rata kanan) selebar bubble, bukan menyusut ke lebar angka.
  const ownTimer = a.page.getByRole('timer', { name: /detik tersisa/ });
  await expect(ownTimer).toBeVisible();
  const timerWidth = (await ownTimer.boundingBox())?.width ?? 0;
  const bubbleWidth = (await a.page.getByRole('button', { name: 'dari a' }).boundingBox())?.width;
  expect(timerWidth).toBeGreaterThanOrEqual((bubbleWidth ?? Infinity) - 1);
  // Urutan daftar berubah: pesan baru dari C.
  await send(c.page, 'dari c lagi');
  await b.page.waitForTimeout(3_000);
  await b.page.reload();

  await expect(b.page.getByText(`@${a.username}`, { exact: true })).toBeVisible();
  await expect(bubbleText(b.page, 'dari a')).toBeVisible();
  // Sisa waktu diambil dari server, bukan diulang dari awal.
  const label = await b.page
    .getByRole('timer', { name: /detik tersisa/ })
    .getAttribute('aria-label');
  const left = Number(label?.match(/\d+/)?.[0]);
  expect(left).toBeGreaterThanOrEqual(5);
  expect(left).toBeLessThanOrEqual(8);
  await expect(bubbleText(b.page, 'dari a')).toHaveCount(0, { timeout: 12_000 });
  const total = Date.now() - opened;
  expect(total).toBeGreaterThan(10_300 - 500);
  expect(total).toBeLessThan(10_300 + 1_500);
  await close(a, b, c);
});

test('lawan hangus lalu username didaftarkan orang lain → tidak ada dua percakapan yang sama', async ({
  browser,
  request,
}) => {
  const rara = await newUser(browser, undefined, 'r');
  await relay.advanceClock(request, 2 * 3_600_000);
  const a = await newUser(browser, undefined, 'a');
  await startChat(a.page, rara.username, 10);
  await send(a.page, 'halo rara lama');
  await logout(a.page);
  await rara.context.close();

  // Akun rara lama hangus (A masih punya ±2 jam). Username yang sama didaftarkan orang lain.
  const response = await relay.advanceClock(request, 70 * 3_600_000 + 60_000);
  const relayNow = ((await response.json()) as { now: number }).now;
  await relay.resetLimits(request);
  const context = await browser.newContext({
    viewport: test.info().project.use.viewport ?? null,
    baseURL: 'http://localhost:4173',
  });
  const page = await context.newPage();
  // Jam perangkat A diselaraskan dengan relay supaya peerExpiresAt di header bisa dibandingkan.
  await page.clock.install({ time: relayNow });
  await page.goto('/');
  await page.getByRole('button', { name: 'Masuk' }).click();
  await loginViaUi(page, a.username);
  await expect(page.getByText(`@${a.username}`)).toBeVisible();
  // Percakapan dengan rara lama hilang dari daftar.
  await expect(page.getByRole('button', { name: new RegExp(`^@${rara.username}`) })).toHaveCount(0);

  const newcomer = await browser.newContext({
    viewport: test.info().project.use.viewport ?? null,
    baseURL: 'http://localhost:4173',
  });
  const newPage = await newcomer.newPage();
  const { registerViaUi } = await import('./helpers');
  await registerViaUi(newPage, rara.username);

  await startChat(page, rara.username, 10);
  await page.getByRole('button', { name: 'Kembali' }).click();
  await expect(page.getByRole('button', { name: new RegExp(`^@${rara.username}`) })).toHaveCount(1);
  await context.close();
  await newcomer.close();
});
