// Smoke: layar ter-render di bawah CSP produksi dan perlindungan tampilan. Alur chat diuji di chat.spec.ts.
import { expect, test } from '@playwright/test';
import { registerViaUi, relay, watch } from './helpers';

test.beforeEach(async ({ request }) => {
  await relay.resetLimits(request);
});

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

  await page.getByRole('button', { name: 'Pengaturan' }).click();
  // Tema = kontrol tersegmentasi: klik label yang terlihat, radio di dalamnya ikut tercentang.
  await page.getByText('Terang', { exact: true }).click();
  await expect(page.getByLabel('Terang')).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await check();
});

test('print menyembunyikan seluruh halaman; salin teks diblok (PRD §9)', async ({ page }) => {
  await registerViaUi(page);
  await page.emulateMedia({ media: 'print' });
  expect(await page.evaluate(() => getComputedStyle(document.body).display)).toBe('none');
  await page.emulateMedia({ media: 'screen' });
  const prevented = await page.evaluate(() => {
    const event = new Event('copy', { bubbles: true, cancelable: true });
    document.querySelector('main')?.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.body).userSelect)).toBe('none');
});

test('bahasa default Inggris; toggle EN/ID berlaku langsung dan tersimpan (D-024)', async ({
  browser,
}) => {
  // Konteks tanpa preferensi tersimpan (config E2E memaksa ID untuk test lain).
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  const check = await watch(page);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { name: 'blackchat' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'English' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByRole('button', { name: 'Bahasa Indonesia' }).click();
  await expect(page.getByRole('button', { name: 'Buat akun' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'id');

  await page.reload();
  await expect(page.getByRole('button', { name: 'Buat akun' })).toBeVisible();
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await check();
  await context.close();
});
