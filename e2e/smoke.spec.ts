// Smoke test W6: layar statis, CSP ketat, perlindungan tampilan. Alur sungguhan (akun, chat) diuji mulai W7.
import { expect, test, type Page } from '@playwright/test';

const ORIGIN = 'http://localhost:4173';

/** Kumpulkan error konsol, error halaman, request keluar origin, dan pelanggaran CSP. */
async function watch(page: Page): Promise<() => Promise<void>> {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== ORIGIN)
      problems.push(`request keluar origin: ${request.url()}`);
  });
  await page.addInitScript(() => {
    const store: string[] = [];
    Object.defineProperty(window, '__csp', { value: store });
    document.addEventListener('securitypolicyviolation', (event) =>
      store.push(`${event.violatedDirective} ${event.blockedURI}`),
    );
  });
  return async () => {
    const csp = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
    expect(csp, 'pelanggaran CSP').toEqual([]);
    expect(problems, 'error/request tak terduga').toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'scroll horizontal').toBeLessThanOrEqual(0);
  };
}

async function openChat(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.getByRole('button', { name: /@rara/ }).click();
}

test('semua layar statis ter-render tanpa error dan tanpa pelanggaran CSP', async ({ page }) => {
  const check = await watch(page);
  const response = await page.goto('/');
  const csp = response?.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(csp).toContain("style-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");

  await expect(page.getByRole('heading', { name: 'blackchat' })).toBeVisible();
  await expect(page.getByText('Pesan yang melebur setelah dibaca.')).toBeVisible();
  await expect(page.getByText('Demo lebur (dev)')).toHaveCount(0);
  await check();

  await page.getByRole('button', { name: 'Buat akun' }).click();
  await expect(page.getByRole('heading', { name: 'Buat akun' })).toBeVisible();
  await expect(page.getByText('Tidak ada pemulihan password.', { exact: false })).toBeVisible();
  await check();

  await page.getByRole('button', { name: 'Kembali' }).click();
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page.getByRole('heading', { name: 'Masuk' })).toBeVisible();
  await page.getByRole('button', { name: 'Masuk' }).click();

  await expect(page.getByRole('timer', { name: 'Sisa umur akun' })).toHaveText(
    /^\dh \d{2}j \d{2}m$/,
  );
  await expect(page.getByRole('button', { name: /@rara/ })).toBeVisible();
  await check();

  await page.getByLabel('Cari username').fill('rara');
  await page.getByLabel('Cari username').press('Enter');
  await expect(page.getByRole('group', { name: 'Pilih timer lebur' })).toBeVisible();
  await page.getByRole('button', { name: 'Mulai percakapan' }).click();

  await expect(page.getByText('jam 8 di tempat biasa')).toBeVisible();
  await expect(page.getByText('Menunggu giliran')).toBeVisible();
  await expect(page.getByText('Belum dibuka')).toBeVisible();
  await check();

  // Pesan contoh melebur setelah 5 detik: efek canvas berjalan di bawah CSP tanpa pelanggaran.
  await expect(page.getByText('Dilebur')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('jam 8 di tempat biasa')).toHaveCount(0);
  await check();

  await page.getByRole('button', { name: 'Verifikasi' }).click();
  await expect(page.getByRole('heading', { name: 'Verifikasi' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Safety number' }).getByRole('listitem')).toHaveCount(
    12,
  );
  await check();

  await page.getByRole('button', { name: 'Kembali' }).click();
  await page.getByRole('button', { name: 'Kembali' }).click();
  await page.getByRole('button', { name: 'Pengaturan' }).click();
  await expect(page.getByRole('heading', { name: 'Pengaturan' })).toBeVisible();
  await page.getByLabel('Terang').check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await check();

  await page.getByRole('button', { name: 'Hapus akun sekarang' }).click();
  await expect(page.getByRole('button', { name: 'Hapus akun sekarang' })).toBeDisabled();
  await page.getByRole('button', { name: 'Keluar' }).click();
  await expect(page.getByRole('heading', { name: 'blackchat' })).toBeVisible();
  await check();
});

test('menu konteks hanya untuk pesan sendiri (PRD §7.4, §10.5)', async ({ page }) => {
  const check = await watch(page);
  await openChat(page);
  await page
    .getByText('jangan bawa ponsel')
    .waitFor({ state: 'detached' })
    .catch(() => undefined);

  // Klik kanan pesan lawan: tidak ada menu apa pun.
  await page.getByText('jam 8 di tempat biasa').click({ button: 'right' });
  await expect(page.getByRole('menu')).toHaveCount(0);

  // Klik kanan pesan sendiri: menu "Batalkan pesan"; Esc menutup.
  const own = page.getByRole('button', { name: 'oke, aku datang' });
  await own.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Batalkan pesan' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);

  // Keyboard: Shift+F10 pada bubble yang fokus, lalu pilih item.
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
  await openChat(page);
  const payload = '<img src=x onerror=alert(1)>';
  await page.getByLabel('Tulis pesan').fill(payload);
  await page.getByRole('button', { name: 'Kirim' }).click();
  await expect(page.getByText(payload, { exact: true })).toBeVisible();
  await expect(page.locator('section img')).toHaveCount(0);
  expect(dialog).toBe(false);
  await check();
});

test('print menyembunyikan seluruh halaman; salin teks diblok (PRD §9)', async ({ page }) => {
  await openChat(page);
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
