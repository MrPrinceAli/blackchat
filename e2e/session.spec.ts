// Akun, sesi tahan refresh, kunci 10 menit, tab duplikat (PRD §5.4, §15.2).
import { expect, test } from '@playwright/test';
import {
  loginViaUi,
  PASSWORD,
  registerViaUi,
  relay,
  sessionFootprint,
  uniqueName,
  watch,
} from './helpers';

test.beforeEach(async ({ request }) => {
  await relay.resetLimits(request);
  await relay.resetClock(request);
});

test.afterEach(async ({ request }) => {
  await relay.resetClock(request);
});

test('register hanya dengan username + password; jam umur ~72 jam; Argon2id terukur', async ({
  page,
}, info) => {
  const check = await watch(page);
  const username = await registerViaUi(page);
  await expect(page.getByRole('timer', { name: 'Sisa umur akun' })).toHaveText(
    /^(3h 00j 00m|2h 23j 5\dm)$/,
  );
  const kdf = await page.evaluate(() =>
    performance.getEntriesByName('bc-kdf').map((e) => Math.round(e.duration)),
  );
  expect(kdf).toHaveLength(1);
  expect(kdf[0]).toBeLessThan(5000);
  info.annotations.push({
    type: 'argon2id-ms',
    description: `${kdf[0]} ms (${info.project.name})`,
  });
  console.log(`Argon2id di browser (${info.project.name}): ${kdf[0]} ms`);
  expect(username.length).toBeGreaterThan(2);
  await check();
});

test('register: validasi langsung username & kebijakan password', async ({ page }) => {
  const taken = await registerViaUi(page);
  await page.getByRole('button', { name: 'Pengaturan' }).click();
  await page.getByRole('button', { name: 'Keluar' }).click();

  await page.getByRole('button', { name: 'Buat akun' }).click();
  await page.getByLabel('Username').fill(taken);
  await expect(page.getByText('Sudah dipakai')).toBeVisible();
  await page.getByLabel('Username').fill(uniqueName('free'));
  await expect(page.getByText('Tersedia')).toBeVisible();

  await page.getByLabel('Password', { exact: true }).fill('qwertyuiop');
  await page.getByLabel('Ulangi password').fill('qwertyuiop');
  await page.getByRole('button', { name: 'Buat akun' }).click();
  await expect(page.getByRole('alert')).toHaveText('Password ini terlalu umum. Pilih yang lain.');

  await page.getByLabel('Password', { exact: true }).fill('pendek');
  await page.getByRole('button', { name: 'Buat akun' }).click();
  await expect(page.getByRole('alert')).toHaveText('Password minimal 10 karakter.');

  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Ulangi password').fill(`${PASSWORD}!`);
  await page.getByRole('button', { name: 'Buat akun' }).click();
  await expect(page.getByRole('alert')).toHaveText('Password tidak sama.');
});

test('login: password salah → pesan umum; benar → Home', async ({ page }) => {
  const username = await registerViaUi(page);
  await page.getByRole('button', { name: 'Pengaturan' }).click();
  await page.getByRole('button', { name: 'Keluar' }).click();
  // Aplikasi pindah ke Welcome setelah storage sesi dibersihkan.
  await expect(page.getByRole('heading', { name: 'blackchat' })).toBeVisible();
  expect(await sessionFootprint(page)).toEqual({ idb: 0, tab: 0 });

  await page.getByRole('button', { name: 'Masuk' }).click();
  await loginViaUi(page, username, 'password yang salah sekali');
  await expect(page.getByRole('alert')).toHaveText('Username atau password salah.');
  await loginViaUi(page, uniqueName('ghost'), PASSWORD);
  await expect(page.getByRole('alert')).toHaveText('Username atau password salah.');
  await loginViaUi(page, username);
  await expect(page.getByText(`@${username}`)).toBeVisible({ timeout: 20_000 });
});

test('refresh tetap masuk; tab baru harus login ulang', async ({ page, context }) => {
  const check = await watch(page);
  const username = await registerViaUi(page);
  await page.reload();
  await expect(page.getByText(`@${username}`)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'blackchat' })).toHaveCount(0);
  await check();

  const fresh = await context.newPage();
  await fresh.goto('/');
  await expect(fresh.getByRole('heading', { name: 'blackchat' })).toBeVisible();
  await expect(fresh.getByText(`@${username}`)).toHaveCount(0);
});

test('tidak aktif 10 menit → peringatan, lalu terkunci; storage sesi kosong', async ({ page }) => {
  await page.clock.install();
  await registerViaUi(page);
  await page.clock.fastForward('09:01');
  await expect(
    page.getByText('Sesi akan dikunci dalam 60 detik karena tidak ada aktivitas.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Tetap masuk' }).click();
  await expect(page.getByText('Sesi akan dikunci dalam 60 detik')).toHaveCount(0);

  await page.clock.fastForward('10:01');
  await expect(page.getByRole('heading', { name: 'Masuk' })).toBeVisible();
  await expect(
    page.getByText('Sesi dikunci karena tidak ada aktivitas.', { exact: false }),
  ).toBeVisible();
  expect(await sessionFootprint(page)).toEqual({ idb: 0, tab: 0 });
});

test('refresh setelah tidak aktif 10 menit → harus login ulang', async ({ page }) => {
  await page.clock.install();
  await registerViaUi(page);
  // Waktu acuan diambil dari jam halaman (bisa sedikit di depan jam runner test).
  const pageNow = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(pageNow + 1_000));
  // Majukan jam dinding tanpa menjalankan timer (seperti tab yang dibekukan), lalu refresh.
  await page.clock.setSystemTime(new Date(pageNow + 10 * 60_000 + 5_000));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'blackchat' })).toBeVisible();
  expect(await sessionFootprint(page)).toEqual({ idb: 0, tab: 0 });
});

test('tab duplikat tidak berbagi sessionKey; tab lama diberi tahu (PRD §5.4)', async ({
  page,
  context,
}) => {
  const username = await registerViaUi(page);
  const copied = await page.evaluate(() => Object.fromEntries(Object.entries(sessionStorage)));

  const duplicate = await context.newPage();
  await duplicate.addInitScript((items: Record<string, string>) => {
    for (const [k, v] of Object.entries(items)) sessionStorage.setItem(k, v);
  }, copied);
  await duplicate.goto('/');
  await expect(duplicate.getByText(`@${username}`)).toBeVisible();

  const tabA = await page.evaluate(() => sessionStorage.getItem('bc.tab'));
  const tabB = await duplicate.evaluate(() => sessionStorage.getItem('bc.tab'));
  expect(tabA).not.toBeNull();
  expect(tabB).not.toBeNull();
  expect(tabB).not.toBe(tabA);
  expect((await sessionFootprint(page)).idb).toBe(2);

  // Satu socket aktif per akun: tab lama menerima 4409.
  await expect(page.getByText('Akun ini sedang dibuka di tab lain.')).toBeVisible();
  await page.getByRole('button', { name: 'Gunakan di sini' }).click();
  await expect(page.getByText('Akun ini sedang dibuka di tab lain.')).toHaveCount(0);
  await expect(duplicate.getByText('Akun ini sedang dibuka di tab lain.')).toBeVisible();
});

test('akun hangus → layar Expired, sesi dihapus (PRD §5.3)', async ({ page, request }) => {
  await page.clock.install();
  await registerViaUi(page);
  // Relay dimajukan sampai 30 dtk sebelum hangus; refresh menyinkronkan sisa umur dari server.
  await relay.advanceClock(request, 72 * 3_600_000 - 30_000);
  await page.reload();
  await expect(page.getByRole('timer', { name: 'Sisa umur akun' })).toHaveText(/^00m [0-3]\dd$/, {
    timeout: 15_000,
  });
  await expect(
    page.getByText('Akun hangus dalam 5 menit. Semua pesan ikut terhapus.'),
  ).toBeVisible();
  await page.clock.fastForward('00:31');
  await expect(page.getByText('Akun ini telah hangus. Semua pesan sudah dihapus.')).toBeVisible();
  expect(await sessionFootprint(page)).toEqual({ idb: 0, tab: 0 });
});
