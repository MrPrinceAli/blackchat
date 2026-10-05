// Kontak, verifikasi, blokir, ganti password, hapus akun (PRD §4.4, §4.8, §5.2, §5.3, §8, §15.2).
import { expect, test, type Page } from '@playwright/test';
import {
  loginViaUi,
  logout,
  newUser,
  openRoomWith,
  PASSWORD,
  registerViaUi,
  relay,
  send,
  startChat,
  type User,
} from './helpers';

test.beforeEach(async ({ request }) => {
  await relay.resetLimits(request);
  await relay.resetClock(request);
});

const close = async (...users: User[]) => {
  for (const u of users) await u.context.close();
};

async function openSettings(page: Page) {
  for (
    let i = 0;
    i < 3 && !(await page.getByRole('button', { name: 'Pengaturan' }).isVisible());
    i++
  ) {
    await page.getByRole('button', { name: 'Kembali' }).click();
  }
  await page.getByRole('button', { name: 'Pengaturan' }).click();
}

async function safetyDigits(page: Page): Promise<string> {
  await page.getByRole('button', { name: /^Verifikasi|^Terverifikasi/ }).click();
  const digits = await page
    .getByRole('list', { name: 'Safety number' })
    .getByRole('listitem')
    .allTextContents();
  return digits.join(' ');
}

test('safety number sama di kedua sisi; status terverifikasi tersimpan di blob kontak', async ({
  browser,
}) => {
  const a = await newUser(browser, undefined, 'a');
  const b = await newUser(browser, undefined, 'b');
  await startChat(a.page, b.username, 10);
  await send(a.page, 'cek kunci');
  await b.page.reload();
  await openRoomWith(b.page, a.username);

  const fromA = await safetyDigits(a.page);
  const fromB = await safetyDigits(b.page);
  expect(fromA).toMatch(/^(\d{5} ){11}\d{5}$/);
  expect(fromA).toBe(fromB);
  await expect(a.page.getByRole('img', { name: 'QR safety number' })).toBeVisible();

  await a.page.getByRole('button', { name: 'Tandai terverifikasi' }).click();
  await expect(a.page.getByRole('button', { name: 'Terverifikasi' })).toBeDisabled();

  // Setelah login ulang, status terverifikasi dibaca dari blob kontak terenkripsi.
  await logout(a.page);
  await a.page.getByRole('button', { name: 'Masuk' }).click();
  await loginViaUi(a.page, a.username);
  await openRoomWith(a.page, b.username);
  await expect(a.page.getByRole('button', { name: 'Terverifikasi' })).toBeVisible();
  await close(a, b);
});

test('blokir: percakapan dihapus dan pesan berikutnya dari akun itu tidak tampil (PRD §15.2)', async ({
  browser,
}) => {
  const a = await newUser(browser, undefined, 'a');
  const b = await newUser(browser, undefined, 'b');
  await startChat(b.page, a.username, 10);
  await send(b.page, 'pesan pertama');
  await a.page.reload();
  await openRoomWith(a.page, b.username);
  await expect(a.page.getByText('pesan pertama', { exact: true })).toBeVisible();

  await a.page.getByRole('button', { name: 'Menu percakapan' }).click();
  await a.page.getByRole('button', { name: `Blokir @${b.username}` }).click();
  await expect(
    a.page.getByText(`Blokir @${b.username}? Semua pesan di percakapan ini dihapus`, {
      exact: false,
    }),
  ).toBeVisible();
  await a.page.getByRole('button', { name: 'Blokir', exact: true }).click();
  await expect(a.page.getByText('Belum ada percakapan. Cari username untuk mulai.')).toBeVisible();

  // Pesan di server ikut terhapus: B tidak lagi melihat pesannya sendiri setelah sinkron.
  await b.page.reload();
  await expect(b.page.getByText(`@${a.username}`, { exact: true })).toBeVisible();
  await b.page.waitForTimeout(500);
  await expect(b.page.getByText('pesan pertama', { exact: true })).toHaveCount(0);

  // B mengirim lagi: A tidak melihat percakapan itu muncul kembali.
  await send(b.page, 'pesan kedua');
  await a.page.waitForTimeout(1_000);
  await a.page.reload();
  await expect(a.page.getByText(`@${a.username}`)).toBeVisible();
  await a.page.waitForTimeout(1_000);
  await expect(a.page.getByRole('button', { name: new RegExp(`^@${b.username}`) })).toHaveCount(0);
  await close(a, b);
});

test('ganti password: password lama ditolak, yang baru berhasil, kontak tetap terbaca', async ({
  browser,
}) => {
  const a = await newUser(browser, undefined, 'a');
  const b = await newUser(browser, undefined, 'b');
  await startChat(a.page, b.username, 10);
  await a.page.getByRole('button', { name: /^Verifikasi/ }).click();
  await a.page.getByRole('button', { name: 'Tandai terverifikasi' }).click();
  await expect(a.page.getByRole('button', { name: 'Terverifikasi' })).toBeDisabled();
  await a.page.getByRole('button', { name: 'Kembali' }).click();

  await openSettings(a.page);
  await a.page.getByRole('button', { name: 'Ganti password' }).click();
  await a.page.getByLabel('Password sekarang').fill('bukan password lama');
  await a.page.getByLabel('Password baru').fill('password baru yang panjang');
  await a.page.getByLabel('Ulangi password').fill('password baru yang panjang');
  await a.page.getByRole('button', { name: 'Ganti password' }).click();
  await expect(a.page.getByText('Password sekarang salah.')).toBeVisible();

  await a.page.getByLabel('Password sekarang').fill(PASSWORD);
  await a.page.getByRole('button', { name: 'Ganti password' }).click();
  await expect(a.page.getByText('Password diganti.')).toBeVisible({ timeout: 15_000 });

  await a.page.getByRole('button', { name: 'Keluar' }).click();
  await a.page.getByRole('button', { name: 'Masuk' }).click();
  await loginViaUi(a.page, a.username, PASSWORD);
  await expect(a.page.getByRole('alert')).toHaveText('Username atau password salah.');
  await loginViaUi(a.page, a.username, 'password baru yang panjang');
  await openRoomWith(a.page, b.username);
  // Blob kontak dienkripsi ulang dengan vaultKey baru: status terverifikasi masih terbaca.
  await expect(a.page.getByRole('button', { name: 'Terverifikasi' })).toBeVisible();
  await close(a, b);
});

test('hapus akun sekarang: semua room akun itu kosong di server; username langsung bebas (PRD §15.2)', async ({
  browser,
}) => {
  const a = await newUser(browser, undefined, 'a');
  const b = await newUser(browser, undefined, 'b');
  await startChat(a.page, b.username, 10);
  await send(a.page, 'pesan dari a');
  await startChat(b.page, a.username, 10);
  await send(b.page, 'pesan dari b');

  await openSettings(a.page);
  await a.page.getByRole('button', { name: 'Hapus akun sekarang' }).click();
  await expect(a.page.getByRole('button', { name: 'Hapus akun sekarang' })).toBeDisabled();
  await a.page
    .getByLabel(`Ketik ${a.username} untuk menghapus akun`, { exact: false })
    .fill(a.username);
  await a.page.getByRole('button', { name: 'Hapus akun sekarang' }).click();
  await expect(a.page.getByRole('heading', { name: 'blackchat' })).toBeVisible({ timeout: 15_000 });

  // B: pesan di room bersama A sudah tidak ada di server, dan A sudah tidak ada.
  // B kembali ke Home dulu supaya refresh tidak otomatis membuka ulang room itu.
  await b.page.getByRole('button', { name: 'Kembali' }).click();
  await b.page.reload();
  await expect(b.page.getByText(`@${b.username}`)).toBeVisible();
  const room = b.page.getByRole('button', { name: new RegExp(`^@${a.username}`) });
  await room.click();
  await expect(b.page.getByText(`Akun @${a.username} sudah tidak ada.`)).toBeVisible();
  await expect(room).toHaveCount(0);
  await expect(b.page.getByText('pesan dari a', { exact: true })).toHaveCount(0);
  await expect(b.page.getByText('pesan dari b', { exact: true })).toHaveCount(0);

  // Username A bisa didaftarkan lagi.
  await registerViaUi(a.page, a.username);
  await close(a, b);
});

test('username didaftarkan ulang: lawan lama mendapat peringatan kunci berbeda (PRD §5.3, §15.2)', async ({
  browser,
}) => {
  const a = await newUser(browser, undefined, 'a');
  const rara = await newUser(browser, undefined, 'r');
  await startChat(a.page, rara.username, 10);
  await send(a.page, 'halo');

  // Akun rara dihapus, lalu username yang sama didaftarkan orang lain.
  await openSettings(rara.page);
  await rara.page.getByRole('button', { name: 'Hapus akun sekarang' }).click();
  await rara.page
    .getByLabel(`Ketik ${rara.username} untuk menghapus akun`, { exact: false })
    .fill(rara.username);
  await rara.page.getByRole('button', { name: 'Hapus akun sekarang' }).click();
  await expect(rara.page.getByRole('heading', { name: 'blackchat' })).toBeVisible({
    timeout: 15_000,
  });
  await registerViaUi(rara.page, rara.username);

  await a.page.getByRole('button', { name: 'Kembali' }).click();
  // Pencarian membuka room lama → lawan berganti kunci → room lama dilupakan → panel percakapan baru.
  await a.page.getByLabel('Cari username').fill(rara.username);
  await a.page.getByLabel('Cari username').press('Enter');
  await expect(a.page.getByText(`Akun @${rara.username} sudah tidak ada.`)).toBeVisible();
  await a.page.getByText('10 dtk', { exact: true }).click();
  await a.page.getByRole('button', { name: 'Mulai percakapan' }).click();
  await expect(
    a.page.getByText(
      `@${rara.username} sekarang memakai kunci berbeda. Ini bisa jadi akun baru dengan username yang sama.`,
    ),
  ).toBeVisible();
  await a.page.getByRole('button', { name: 'Kembali' }).click();
  await expect(a.page.getByRole('button', { name: new RegExp(`^@${rara.username}`) })).toHaveCount(
    1,
  );
  await close(a, rara);
});
