// Smoke: semua layar ter-render di bawah CSP produksi, perlindungan tampilan, dan layar contoh Chat/Verify
// (Chat & Verify memakai data contoh sampai W8/W11).
import { expect, test, type Page } from '@playwright/test';
import { registerViaUi, relay, watch } from './helpers';

test.beforeEach(async ({ request }) => {
  await relay.resetLimits(request);
});

async function openSampleChat(page: Page) {
  await registerViaUi(page);
  await page.getByLabel('Cari username').fill('rara');
  await page.getByLabel('Cari username').press('Enter');
  await page.getByRole('button', { name: 'Mulai percakapan' }).click();
}

test('semua layar ter-render tanpa error dan tanpa pelanggaran CSP', async ({ page }) => {
  const check = await watch(page);
  const response = await page.goto('/');
  const csp = response?.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(csp).toContain("style-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain('connect-src');

  await expect(page.getByRole('heading', { name: 'blackchat' })).toBeVisible();
  await expect(page.getByText('Pesan yang melebur setelah dibaca.')).toBeVisible();
  await expect(page.getByText('Demo lebur (dev)')).toHaveCount(0);
  await check();

  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page.getByRole('heading', { name: 'Masuk' })).toBeVisible();
  await check();
  await page.getByRole('button', { name: 'Kembali' }).click();

  await registerViaUi(page);
  await expect(page.getByRole('timer', { name: 'Sisa umur akun' })).toHaveText(
    /^[23]h \d{2}j \d{2}m$/,
  );
  await expect(page.getByText('Belum ada percakapan. Cari username untuk mulai.')).toBeVisible();
  await check();

  await page.getByLabel('Cari username').fill('rara');
  await page.getByLabel('Cari username').press('Enter');
  await expect(page.getByRole('group', { name: 'Pilih timer lebur' })).toBeVisible();
  await page.getByRole('button', { name: 'Mulai percakapan' }).click();
  await expect(page.getByText('jam 8 di tempat biasa')).toBeVisible();
  await expect(page.getByText('Menunggu giliran')).toBeVisible();
  await check();

  // Efek lebur canvas berjalan di bawah CSP tanpa pelanggaran.
  await expect(page.getByText('Dilebur')).toBeVisible({ timeout: 10_000 });
  await check();

  await page.getByRole('button', { name: 'Verifikasi' }).click();
  await expect(page.getByRole('list', { name: 'Safety number' }).getByRole('listitem')).toHaveCount(
    12,
  );
  await check();

  await page.getByRole('button', { name: 'Kembali' }).click();
  await page.getByRole('button', { name: 'Kembali' }).click();
  await page.getByRole('button', { name: 'Pengaturan' }).click();
  await page.getByLabel('Terang').check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await check();
});

test('menu konteks hanya untuk pesan sendiri (PRD §7.4, §10.5)', async ({ page }) => {
  const check = await watch(page);
  await openSampleChat(page);
  await page.getByText('jam 8 di tempat biasa').click({ button: 'right' });
  await expect(page.getByRole('menu')).toHaveCount(0);

  const own = page.getByRole('button', { name: 'oke, aku datang' });
  await own.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Batalkan pesan' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);

  await own.focus();
  await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Batalkan pesan' }).click();
  await expect(page.getByText('oke, aku datang')).toHaveCount(0);
  await check();
});

test('pesan berisi HTML tampil sebagai teks (PRD §15.2)', async ({ page }) => {
  const check = await watch(page);
  let dialog = false;
  page.on('dialog', async (d) => {
    dialog = true;
    await d.dismiss();
  });
  await openSampleChat(page);
  const payload = '<img src=x onerror=alert(1)>';
  await page.getByLabel('Tulis pesan').fill(payload);
  await page.getByRole('button', { name: 'Kirim' }).click();
  await expect(page.getByText(payload, { exact: true })).toBeVisible();
  await expect(page.locator('section img')).toHaveCount(0);
  expect(dialog).toBe(false);
  await check();
});

test('print menyembunyikan seluruh halaman; salin teks diblok (PRD §9)', async ({ page }) => {
  await openSampleChat(page);
  await page.emulateMedia({ media: 'print' });
  expect(await page.evaluate(() => getComputedStyle(document.body).display)).toBe('none');
  await page.emulateMedia({ media: 'screen' });
  const prevented = await page.evaluate(() => {
    const event = new Event('copy', { bubbles: true, cancelable: true });
    document.querySelector('.text')?.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.body).userSelect)).toBe('none');
});
