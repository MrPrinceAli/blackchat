// Batalkan pesan & kesepakatan timer (PRD §7.3, §7.4, §10.5, §15.2).
import { expect, test } from '@playwright/test';
import { newUser, openRoomWith, relay, send, startChat, watch, type User } from './helpers';

test.beforeEach(async ({ request }) => {
  await relay.resetLimits(request);
  await relay.resetClock(request);
});

const close = async (...users: User[]) => {
  for (const u of users) await u.context.close();
};

async function pair(browser: Parameters<typeof newUser>[0]) {
  const a = await newUser(browser, undefined, 'a');
  const b = await newUser(browser, undefined, 'b');
  return { a, b };
}

test('batalkan pesan: hilang di kedua sisi dan di server; menu hanya untuk pesan sendiri', async ({
  browser,
}) => {
  const { a, b } = await pair(browser);
  const check = await watch(a.page);
  await startChat(a.page, b.username, 10);
  await send(a.page, 'salah kirim');
  await b.page.reload();
  await openRoomWith(b.page, a.username);
  await expect(b.page.getByText('salah kirim', { exact: true })).toBeVisible();

  // Klik kanan pesan lawan: tidak ada menu sama sekali.
  await b.page.getByText('salah kirim', { exact: true }).click({ button: 'right' });
  await expect(b.page.getByRole('menu')).toHaveCount(0);

  // Pesan sudah dilihat B → menu memberi keterangan.
  const own = a.page.getByRole('button', { name: 'salah kirim' });
  await own.click({ button: 'right' });
  await expect(a.page.getByRole('menuitem', { name: /Batalkan pesan/ })).toBeVisible();
  await expect(
    a.page.getByText('Sudah dilihat. Pesan tetap dihapus dari kedua sisi.'),
  ).toBeVisible();
  await a.page.getByRole('menuitem', { name: /Batalkan pesan/ }).click();

  // Pengirim: hilang langsung. Penerima: "Pesan dibatalkan", lalu hilang setelah 3 dtk.
  await expect(a.page.getByText('salah kirim', { exact: true })).toHaveCount(0);
  await expect(b.page.getByText('salah kirim', { exact: true })).toHaveCount(0);
  await expect(b.page.getByText('Pesan dibatalkan')).toBeVisible();
  await expect(b.page.getByText('Pesan dibatalkan')).toHaveCount(0, { timeout: 5_000 });

  // Server: sinkron ulang tidak lagi memuat pesan itu.
  await b.page.reload();
  await expect(b.page.getByText(`@${a.username}`, { exact: true })).toBeVisible();
  await b.page.waitForTimeout(500);
  await expect(b.page.getByText('salah kirim', { exact: true })).toHaveCount(0);
  await check();
  await close(a, b);
});

test('menu konteks lewat keyboard (Shift+F10) dan Esc; pesan belum dilihat tanpa keterangan', async ({
  browser,
}) => {
  const { a, b } = await pair(browser);
  await startChat(a.page, b.username, 10);
  await send(a.page, 'pesan keyboard');
  const own = a.page.getByRole('button', { name: 'pesan keyboard' });
  await own.focus();
  await a.page.keyboard.press('Shift+F10');
  await expect(a.page.getByRole('menuitem', { name: 'Batalkan pesan' })).toBeVisible();
  await expect(a.page.getByText('Sudah dilihat.', { exact: false })).toHaveCount(0);
  await a.page.keyboard.press('Escape');
  await expect(a.page.getByRole('menu')).toHaveCount(0);

  await own.focus();
  await a.page.keyboard.press('Shift+F10');
  await a.page.getByRole('menuitem', { name: 'Batalkan pesan' }).click();
  await expect(a.page.getByText('pesan keyboard', { exact: true })).toHaveCount(0);
  await close(a, b);
});

test('usulan timer hanya berlaku setelah disetujui; tolak tidak mengubah timer', async ({
  browser,
}) => {
  const { a, b } = await pair(browser);
  await startChat(a.page, b.username, 10);
  await send(a.page, 'mulai');
  await b.page.reload();
  await openRoomWith(b.page, a.username);
  const header = (u: User, ttl: number) =>
    u.page.getByRole('button', { name: new RegExp(`^${ttl} detik`) });
  await expect(header(a, 10)).toBeVisible();

  // A mengusulkan 3 detik.
  await header(a, 10).click();
  await a.page.getByText('3 dtk', { exact: true }).click();
  await a.page.getByRole('button', { name: 'Usulkan', exact: true }).click();
  await expect(a.page.getByText('Menunggu persetujuan timer 3 detik.')).toBeVisible();
  await expect(b.page.getByText(`@${a.username} ingin mengubah timer ke 3 detik.`)).toBeVisible();
  // Belum disetujui: timer tetap 10.
  await expect(header(a, 10)).toBeVisible();
  await expect(header(b, 10)).toBeVisible();

  // B menolak.
  await b.page.getByRole('button', { name: 'Tolak' }).click();
  await expect(a.page.getByText('Usulan timer ditolak.')).toBeVisible();
  await expect(header(a, 10)).toBeVisible();

  // Usulan lagi, B setuju → kedua sisi 3 detik.
  await header(a, 10).click();
  await a.page.getByText('3 dtk', { exact: true }).click();
  await a.page.getByRole('button', { name: 'Usulkan', exact: true }).click();
  await b.page.getByRole('button', { name: 'Setuju' }).click();
  await expect(header(a, 3)).toBeVisible();
  await expect(header(b, 3)).toBeVisible();
  await expect(a.page.getByText('Timer sekarang 3 detik.')).toBeVisible();

  // Pesan berikutnya memakai timer baru. Ia antre di belakang "mulai" (timer lama 10 dtk masih berjalan).
  await send(a.page, 'cepat');
  await expect(b.page.getByLabel('Menunggu giliran')).toHaveCount(1);
  await expect(b.page.getByText('mulai', { exact: true })).toHaveCount(0, { timeout: 15_000 });
  await expect(b.page.getByText('cepat', { exact: true })).toBeVisible({ timeout: 5_000 });
  await expect(b.page.getByText('cepat', { exact: true })).toHaveCount(0, { timeout: 6_000 });
  await close(a, b);
});

test('A dan B memulai bersamaan dengan timer berbeda → room sama, timer sama (PRD §15.2)', async ({
  browser,
}) => {
  const { a, b } = await pair(browser);
  await startChat(a.page, b.username, 5);
  // B memulai percakapan dengan A sebelum melihatnya di daftar, memilih 3 detik.
  await b.page.getByLabel('Cari username').fill(a.username);
  await b.page.getByLabel('Cari username').press('Enter');
  // Daftar B belum memuat room dari A (belum ada pesan), jadi B memilih timer sendiri.
  await b.page.getByText('3 dtk', { exact: true }).click();
  await b.page.getByRole('button', { name: 'Mulai percakapan' }).click();
  await expect(b.page.getByText(`@${a.username}`, { exact: true })).toBeVisible();
  await expect(
    b.page.getByText('Kalian memulai bersamaan. Timer yang berlaku 5 detik.'),
  ).toBeVisible();
  await expect(b.page.getByRole('button', { name: /^5 detik/ })).toBeVisible();
  await expect(a.page.getByRole('button', { name: /^5 detik/ })).toBeVisible();

  await send(b.page, 'dari b');
  await expect(a.page.getByText('dari b', { exact: true })).toBeVisible();
  await close(a, b);
});
