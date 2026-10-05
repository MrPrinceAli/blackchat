// Gambar README: banner, social preview, dan screenshot aplikasi (dark/light, mobile/desktop).
// Bukan bagian suite test. Jalankan: pnpm readme:assets (butuh relay & build lokal seperti E2E).
import { copyFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { PASSWORD, relay } from '../../e2e/helpers';

const OUT = 'docs/assets/screenshots';
const ASSETS = 'docs/assets';
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

async function user(browser: Browser, name: string, viewport = MOBILE) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    baseURL: 'http://localhost:4173',
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Buat akun' }).click();
  await page.getByLabel('Username').fill(name);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Ulangi password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Buat akun' }).click();
  await expect(page.getByText(`@${name}`)).toBeVisible({ timeout: 20_000 });
  return page;
}

async function start(page: Page, peer: string, ttl: number) {
  await page.getByLabel('Cari username').fill(peer);
  await page.getByLabel('Cari username').press('Enter');
  await page.getByText(`${ttl} dtk`, { exact: true }).click();
  await page.getByRole('button', { name: 'Mulai percakapan' }).click();
  await expect(page.getByLabel('Tulis pesan')).toBeVisible();
}

async function say(page: Page, text: string) {
  await page.getByLabel('Tulis pesan').fill(text);
  await page.getByRole('button', { name: 'Kirim' }).click();
  await expect(page.getByText('Mengirim...')).toHaveCount(0);
}

async function artwork(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 1200;
    c.height = 900;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 1200, 900);
    g.addColorStop(0, '#0d0d0d');
    g.addColorStop(1, '#5c5c5c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1200, 900);
    ctx.fillStyle = '#e5e5e5';
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.arc(150 + i * 120, 450 + Math.sin(i) * 160, 30 + i * 6, 0, Math.PI * 2);
      ctx.fill();
    }
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.9));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (const x of bytes) s += String.fromCharCode(x);
    return btoa(s);
  });
  return Buffer.from(b64, 'base64');
}

test('screenshot README', async ({ browser, request }) => {
  test.setTimeout(180_000);
  await relay.resetLimits(request);

  // Layar awal.
  for (const [name, viewport] of [
    ['welcome-mobile', MOBILE],
    ['welcome-desktop', DESKTOP],
  ] as const) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: 'dark' });
    const p = await ctx.newPage();
    await p.goto('http://localhost:4173/');
    await expect(p.getByRole('heading', { name: 'blackchat' })).toBeVisible();
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${OUT}/${name}.png` });
    await ctx.close();
  }

  const rara = await user(browser, 'rara');
  await relay.resetLimits(request);
  const dimas = await user(browser, 'dimas');
  const sekar = await user(browser, 'sekar');
  await relay.resetLimits(request);

  // Dimas & Sekar mengirim pesan ke Rara.
  await start(dimas, 'rara', 7);
  await say(dimas, 'jam 8 di tempat biasa');
  await say(dimas, 'jangan bawa ponsel');
  await start(sekar, 'rara', 5);
  await say(sekar, 'dokumennya sudah kukirim');

  // Home Rara: daftar percakapan dengan penghitung belum dibuka.
  await rara.reload();
  await expect(rara.getByRole('button', { name: /^@dimas/ })).toBeVisible();
  await rara.waitForTimeout(500);
  await rara.screenshot({ path: `${OUT}/home.png` });

  // Rara membalas Dimas, dan membuka room: pesan terdepan menghitung mundur, sisanya menunggu giliran.
  await rara.getByRole('button', { name: /^@dimas/ }).click();
  await expect(rara.getByRole('timer', { name: /detik tersisa/ })).toBeVisible();
  await say(rara, 'oke, aku datang');
  await rara.waitForTimeout(1200);
  await rara.screenshot({ path: `${OUT}/chat.png` });

  // Efek lebur sedang berlangsung (600 ms): potret secepatnya begitu canvas lebur muncul.
  // Animasi dibekukan ~120 ms setelah canvas lebur muncul (frame ditahan), lalu dilanjutkan setelah dipotret.
  await rara.evaluate(() => {
    const w = window as unknown as { __held: FrameRequestCallback[]; __release: () => void };
    const raf = window.requestAnimationFrame.bind(window);
    let freezeAt = Infinity;
    w.__held = [];
    window.requestAnimationFrame = (cb) => {
      if (performance.now() >= freezeAt) {
        w.__held.push(cb);
        return 0;
      }
      return raf(cb);
    };
    w.__release = () => {
      freezeAt = Infinity;
      window.requestAnimationFrame = raf;
      for (const cb of w.__held.splice(0)) raf(cb);
    };
    new MutationObserver((_, observer) => {
      if (document.querySelector('.burn canvas')) {
        freezeAt = performance.now() + 120;
        observer.disconnect();
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
  await rara.locator('.burn canvas').first().waitFor({ state: 'attached', timeout: 15_000 });
  await rara.waitForTimeout(600);
  await rara.screenshot({ path: `${OUT}/burn.png`, animations: 'allow' });
  await rara.evaluate(() => (window as unknown as { __release: () => void }).__release());

  // Gambar terenkripsi.
  await dimas
    .locator('input[type=file]')
    .setInputFiles({ name: 'foto.jpg', mimeType: 'image/jpeg', buffer: await artwork(dimas) });
  await expect(dimas.getByText('Belum dibuka').last()).toBeVisible({ timeout: 20_000 });
  await expect(rara.getByRole('img', { name: 'Gambar rahasia' })).toBeVisible({ timeout: 30_000 });
  await rara.waitForTimeout(800);
  await rara.screenshot({ path: `${OUT}/image.png` });

  // Sisi pengirim: "Belum dibuka" dan menu batalkan.
  await say(dimas, 'kalau salah, bisa dibatalkan');
  const own = dimas.getByRole('button', { name: 'kalau salah, bisa dibatalkan' });
  const box = (await own.boundingBox())!;
  await own.click({ button: 'right', position: { x: 12, y: box.height - 4 } });
  await expect(dimas.getByRole('menuitem', { name: /Batalkan pesan/ })).toBeVisible();
  await dimas.waitForTimeout(400);
  await dimas.screenshot({ path: `${OUT}/retract.png` });
  await dimas.keyboard.press('Escape');

  // Usulan timer.
  await dimas.getByRole('button', { name: /^7 detik/ }).click();
  await dimas.getByText('3 dtk', { exact: true }).click();
  await dimas.getByRole('button', { name: 'Usulkan', exact: true }).click();
  await expect(rara.getByText('@dimas ingin mengubah timer ke 3 detik.')).toBeVisible();
  await rara.waitForTimeout(400);
  await rara.screenshot({ path: `${OUT}/ttl.png` });

  // Verifikasi.
  await rara.getByRole('button', { name: /^Verifikasi/ }).click();
  await expect(rara.getByRole('img', { name: 'QR safety number' })).toBeVisible();
  await rara.waitForTimeout(300);
  await rara.screenshot({ path: `${OUT}/verify.png` });

  // Desktop: Sekar membuka room dengan Rara, lalu Rara membuka & membalas; keduanya menghitung mundur.
  const desk = await browser.newContext({
    viewport: DESKTOP,
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    baseURL: 'http://localhost:4173',
  });
  const deskPage = await desk.newPage();
  await deskPage.goto('/');
  await deskPage.getByRole('button', { name: 'Masuk' }).click();
  await deskPage.getByLabel('Username').fill('sekar');
  await deskPage.getByLabel('Password').fill(PASSWORD);
  await deskPage.getByRole('button', { name: 'Masuk' }).click();
  await deskPage.getByRole('button', { name: /^@rara/ }).click();
  await expect(deskPage.getByText('dokumennya sudah kukirim')).toBeVisible();
  for (
    let i = 0;
    i < 3 && !(await rara.getByRole('button', { name: 'Pengaturan' }).isVisible());
    i++
  ) {
    await rara.getByRole('button', { name: 'Kembali' }).click();
  }
  await rara.getByRole('button', { name: /^@sekar/ }).click();
  await say(rara, 'sudah kubaca, terima kasih');
  await expect(deskPage.getByText('sudah kubaca, terima kasih')).toBeVisible();
  await deskPage.waitForTimeout(1200);
  await deskPage.screenshot({ path: `${OUT}/desktop-chat.png` });

  // Halaman masuk (logo di atas judul).
  const auth = await browser.newContext({
    viewport: MOBILE,
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  const ap = await auth.newPage();
  await ap.goto('http://localhost:4173/');
  await ap.getByRole('button', { name: 'Masuk' }).click();
  await expect(ap.getByRole('heading', { name: 'Masuk' })).toBeVisible();
  await ap.waitForTimeout(600);
  await ap.screenshot({ path: `${OUT}/login.png` });

  // Tema terang.
  const light = await browser.newContext({
    viewport: MOBILE,
    deviceScaleFactor: 2,
    colorScheme: 'light',
  });
  const lp = await light.newPage();
  await lp.goto('http://localhost:4173/');
  await expect(lp.getByRole('heading', { name: 'blackchat' })).toBeVisible();
  await lp.waitForTimeout(400);
  await lp.screenshot({ path: `${OUT}/welcome-light.png` });
});

test('banner & social preview', async ({ browser }) => {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const file = pathToFileURL('tooling/readme-assets/banner.html').href;
  for (const [name, w, h] of [
    ['banner.png', 1280, 420],
    ['social-preview.png', 1280, 640],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${file}?w=${w}&h=${h}`);
    await page.locator('body[data-ready="1"]').waitFor();
    await page.locator('canvas').screenshot({ path: `${ASSETS}/${name}`, scale: 'device' });
  }
  await page.close();
});

test('ikon aplikasi & og image', async ({ browser }) => {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const file = pathToFileURL('tooling/readme-assets/icon.html').href;
  for (const [name, size, pad, radius] of [
    ['favicon-32.png', 32, 0.7, 0.22],
    ['favicon-64.png', 64, 0.66, 0.22],
    ['apple-touch-icon.png', 180, 0.58, 0],
    ['icon-192.png', 192, 0.58, 0],
    ['icon-512.png', 512, 0.58, 0],
    ['icon-maskable-512.png', 512, 0.44, 0],
  ] as const) {
    await page.setViewportSize({ width: size, height: size });
    await page.goto(`${file}?s=${size}&pad=${pad}&r=${radius}`);
    await page.locator('body[data-ready="1"]').waitFor({ state: 'attached' });
    await page
      .locator('#icon')
      .screenshot({ path: `apps/web/public/${name}`, omitBackground: true });
  }
  await page.close();
  copyFileSync(`${ASSETS}/social-preview.png`, 'apps/web/public/og.png');
});

test('data wordmark', async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto(pathToFileURL('tooling/readme-assets/wordmark.html').href);
  // Halaman generator kosong (tak terlihat): tunggu atributnya saja.
  await page.locator('body[data-ready="1"]').waitFor({ state: 'attached' });
  const data = await page.evaluate(() => (window as unknown as { __wordmark: unknown }).__wordmark);
  writeFileSync(
    'apps/web/src/lib/wordmark.ts',
    `// DIBUAT OTOMATIS oleh pnpm readme:assets (tooling/readme-assets/wordmark.html). Jangan diedit manual.
// Wordmark: "blackch" sebagai teks, "at" melebur jadi sel piksel [x, y, sisi, opacity];
// satuan = font-size 100, y relatif terhadap baseline (negatif = ke atas).
export const WORDMARK = ${JSON.stringify(data)} as const;
`,
  );
  await page.close();
});
