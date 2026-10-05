// Gambar terenkripsi end-to-end (PRD §7.5, §15.2). Penghapusan EXIF/GPS diuji di browser oleh
// apps/web/src/lib/images.browser.test.ts; chunk identik & upload terputus diuji di relay.
import { expect, test, type Page } from '@playwright/test';
import { newUser, openRoomWith, relay, startChat, watch, type User } from './helpers';

test.beforeEach(async ({ request }) => {
  await relay.resetLimits(request);
  await relay.resetClock(request);
});

const close = async (...users: User[]) => {
  for (const u of users) await u.context.close();
};

/** JPEG buatan browser dengan pola acak (ukuran mendekati foto). */
async function makeJpeg(page: Page, width: number, height: number): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ({ width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#222');
      gradient.addColorStop(1, '#ddd');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/jpeg', 0.9));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (const b of bytes) binary += String.fromCharCode(b);
      return btoa(binary);
    },
    { width, height },
  );
  return Buffer.from(base64, 'base64');
}

async function attachImage(page: Page, buffer: Buffer, caption = '', name = 'foto.jpg') {
  if (caption) await page.getByLabel('Tulis pesan').fill(caption);
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'image/jpeg', buffer });
}

test('gambar terkirim, tampil di canvas, melebur sesuai timer di kedua sisi', async ({
  browser,
}) => {
  const a = await newUser(browser, undefined, 'a');
  const b = await newUser(browser, undefined, 'b');
  const check = await watch(b.page);
  await startChat(a.page, b.username, 3);
  await attachImage(a.page, await makeJpeg(a.page, 2400, 1600), 'pemandangan');

  // Pengirim: pratinjau + "Belum dibuka" setelah semua chunk terunggah.
  await expect(a.page.getByRole('img', { name: 'Gambar rahasia' })).toBeVisible();
  await expect(a.page.getByText('Belum dibuka')).toBeVisible({ timeout: 15_000 });

  await b.page.reload();
  await openRoomWith(b.page, a.username);
  await expect(b.page.getByRole('img', { name: 'Gambar rahasia' })).toBeVisible();
  await expect(b.page.getByText('pemandangan', { exact: true })).toBeVisible();
  // Canvas, bukan <img>: tidak bisa diseret/disimpan lewat menu.
  await expect(b.page.locator('section img')).toHaveCount(0);
  await expect(b.page.locator('section canvas')).toHaveCount(1);

  await expect(b.page.getByRole('timer', { name: /detik tersisa/ })).toBeVisible();
  await expect(b.page.getByRole('img', { name: 'Gambar rahasia' })).toHaveCount(0, {
    timeout: 6_000,
  });
  await expect(b.page.getByText('pemandangan', { exact: true })).toHaveCount(0);
  await expect(a.page.getByRole('img', { name: 'Gambar rahasia' })).toHaveCount(0, {
    timeout: 6_000,
  });
  await check();
  await close(a, b);
});

test('gambar portrait sangat tinggi tetap memicu timer di layar 320×568 (PRD §7.2)', async ({
  browser,
}) => {
  const a = await newUser(browser, { width: 1280, height: 800 }, 'a');
  const b = await newUser(browser, { width: 320, height: 568 }, 'b');
  await startChat(a.page, b.username, 5);
  await attachImage(a.page, await makeJpeg(a.page, 600, 6000));
  await expect(a.page.getByText('Belum dibuka')).toBeVisible({ timeout: 15_000 });

  await b.page.reload();
  await openRoomWith(b.page, a.username);
  const frame = b.page.getByRole('img', { name: 'Gambar rahasia' });
  await expect(frame).toBeVisible();
  const box = await frame.boundingBox();
  expect(box!.height).toBeLessThanOrEqual(568 * 0.6 + 1);
  await expect(b.page.getByRole('timer', { name: /detik tersisa/ })).toBeVisible();
  await close(a, b);
});

test('gambar > 15 MB ditolak sebelum diproses', async ({ browser }) => {
  const a = await newUser(browser, undefined, 'a');
  const b = await newUser(browser, undefined, 'b');
  await startChat(a.page, b.username, 5);
  await attachImage(a.page, Buffer.alloc(15 * 1024 * 1024 + 1), '', 'besar.jpg');
  await expect(a.page.getByText('Gambar maksimal 15 MB.')).toBeVisible();
  await expect(a.page.getByRole('img', { name: 'Gambar rahasia' })).toHaveCount(0);
  await close(a, b);
});
