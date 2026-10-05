# PROGRESS — BlackChat

Diperbarui di akhir setiap gelombang (lihat `docs/BLACKCHAT-WAVES.md`). Entri terbaru di bawah.

| Gelombang | Nama | Status | PR |
|---|---|---|---|
| W0 | Fondasi monorepo | Selesai, merged | #1 |
| W1 | Protocol | Selesai, merged | #2 → #6 |
| W2 | Crypto inti | Selesai, merged | #3 → #6 |
| W3 | Crypto room & pesan | Selesai, merged | #4 → #7 |
| W4 | Relay: akun & limiter | Selesai, merged | #10 |
| W5 | Relay: InboxDO & RoomDO | Selesai, merged | #11 |
| W6 | Web: fondasi & UI statis | Selesai, merged | #12 |
| W7 | Web: akun, sesi & koneksi | Selesai, merged | #13 |
| W8 | Chat teks end-to-end | Selesai, merged | #14 |
| W9 | Batalkan pesan & kesepakatan timer | Selesai, merged | #15 |
| W10 | Gambar | Selesai, merged | #16 |
| W11 | Kontak, verifikasi, blokir & settings | Selesai | branch `w11-kontak` |
| W12 | Rilis: deploy, E2E penuh, dokumen | Belum mulai | — |

---

## Log

### 2026-10-04 — Perencanaan
- Selesai: `CLAUDE.md`, `docs/BLACKCHAT-WAVES.md`, `docs/DECISIONS.md` (D-001 s.d. D-007).
- Tertunda: semua gelombang.
- Langkah manual untuk user: lihat "Langkah manual" di W0 sebelum mulai.

### 2026-10-04 — W0 Fondasi monorepo
- Selesai: monorepo pnpm 9 (`apps/web`, `apps/relay`, `packages/protocol`, `packages/crypto`), TypeScript 6 strict
  (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), ESLint dengan aturan PRD §12 + `tooling/check-lint-rules.js`
  (22 kasus: pelanggaran ditolak, pengecualian sah lolos), Prettier, Vitest 4, `constants.ts` lengkap,
  `wrangler.toml` (+ `env.test`, `send_metrics = false`), migrasi D1, `clock.ts` (D-006), CI dengan action dipin SHA,
  Dependabot, README dengan tabel dependensi.
- Keputusan baru: D-008 (label domain separation tambahan).
- Gerbang lokal: install, format:check, lint, typecheck, test (4 paket), build — semua hijau.
- Tertunda: push & PR (repo GitHub belum dibuat); CI belum pernah jalan di GitHub.
- Langkah manual untuk user: buat repo `blackchat` di GitHub; aktifkan 2FA.

### 2026-10-04 — W1 Protocol
- Selesai: `encoding.ts` (base64url/hex/base32 Crockford kanonik, canonical JSON ala RFC 8785, u16/u32),
  `types.ts` (akun HTTP, semua frame WS dua arah, op room, data result, Inner, header, kontak),
  `validate.ts` (combinator tanpa dependensi; menolak field asing, tipe salah, ukuran/alfabet salah),
  `frames.ts` (frame biner chunk PRD §13.2).
- Test: 673 (suite mutasi otomatis untuk 55 contoh valid + test semantik + vektor RFC 4648).
  Test menemukan bug: field asing `__proto__` lolos karena operator `in`; diperbaiki dengan `Object.hasOwn`.
- Keputusan baru: D-009 (format wire).
- Tertunda: push & PR.

### 2026-10-04 — W2 Crypto inti
- Selesai: `sodium.ts` (ready() sekali), `keys.ts` (identitas, userId, xPkSig, tanda tangan request & challenge WS),
  `pwhash.ts` (Argon2id D-002, NFC, kebijakan password), `aead.ts`, `seal.ts`, `pad.ts`, `vault.ts`, `contacts.ts`,
  `safety.ts`, `ids.ts`, `bytes.ts` (equalBytes constant-time, wipe).
- Test: 34, termasuk vektor tetap dari generator independen (libsodium mentah) dan pemeriksaan silang dengan
  `@noble/hashes` (Argon2id, BLAKE2b) serta `node:crypto` (Ed25519).
- Durasi Argon2id (64 MiB, t=3) di Node 22 WASM, Apple Silicon: ±120 ms. Diukur ulang di browser pada W7.
- Keputusan baru: D-010.
- Tertunda: push & PR.

### 2026-10-04 — W3 Crypto room & pesan
- Selesai: `room.ts` (shared, roomId, inboxRoomId per anggota D-001, memberKey/Tag, opHash, proof, roomAuth),
  `header.ts` (header tersegel 560 byte tetap, cek konsistensi), `message.ts` (signInner, verifyInner,
  encryptMessage/decryptMessage dengan keyForPeer/keyForSelf, effectiveTtl), `image.ts` (chunk 256 KB identik,
  AAD per index, cek hash).
- Test: 64 di packages/crypto (30 baru untuk room/pesan/gambar), termasuk vektor independen
  `test/vectors-room.json` untuk relay W5. Mutasi manual pada 5 pemeriksaan keamanan: semuanya tertangkap
  (satu baru tertangkap setelah test "Inner dibungkus ulang" ditambahkan).
- Keputusan baru: D-011.
- Tertunda: —

### 2026-10-05 — Push, CI, dan merge W0–W3
- Repo private `MrPrinceAli/blackchat` dibuat; W0–W3 di-push sebagai PR bertumpuk #1–#4, CI hijau semua.
- CI awalnya tidak terpicu karena PR dibuka sebelum Actions pertama kali aktif di repo baru; buka-tutup PR memicunya.
- Test gambar W3 timeout di runner CI (data acak 1,5 MB lewat WASM lambat): data uji diganti `node:crypto`, timeout 30 dtk.
- Merge: #1 masuk `main`. Menghapus branch base `w0-fondasi` menutup PR #2 otomatis, dan #3 ter-merge ke
  `w1-protocol`. Dipulihkan tanpa force-push lewat #6 (W1+W2) dan #7 (W3). Tree `main` identik dengan W3 yang
  sudah teruji; CI `main` hijau. Pelajaran: untuk PR bertumpuk, jangan `--delete-branch` sebelum PR berikutnya
  dipindah base-nya ke `main`.
- PR Dependabot #5 (vitest 5) ditutup; Dependabot sekarang mengabaikan versi mayor vitest dan TypeScript.

### 2026-10-05 — W4 Relay: akun & limiter
- Selesai: semua endpoint PRD §5.2 (`account.ts`), router + CORS + header keamanan (`index.ts`, `http.ts`),
  verifikasi Ed25519 WebCrypto (`verify.ts`), BLAKE2b `@noble/hashes` (`hash.ts`), LimiterDO 16 shard tanpa storage
  dengan jeda login per username (`limiter.ts`), cron akun hangus, `InboxDO.destroy()`, route test (`test-routes.ts`).
- Test: 44 di workerd (`@cloudflare/vitest-pool-workers`), termasuk kompatibilitas relay ↔ libsodium lewat vektor
  `packages/crypto/test/*.json`. Mutasi manual pada 8 pemeriksaan keamanan: semuanya tertangkap (cek `xPkSig`
  baru tertangkap setelah test "xPkSig palsu dengan request bertanda tangan sah" ditambahkan).
- CI: langkah baru `check:bundle` memastikan route test tidak ada di bundle produksi (kontrol negatif terbukti gagal).
- Keputusan baru: D-012 (kunci limiter dari `SALT_SECRET` mengoreksi D-003; `compatibility_date` 2026-08-22).
- Relay belum di-deploy (W12, D-005).
- Langkah manual untuk user: tidak ada untuk W4. Akun Cloudflare + 2FA baru dibutuhkan di W12.

### 2026-10-05 — W5 Relay: InboxDO & RoomDO
- Selesai: `GET /v1/ws/:userId` → InboxDO (WebSocket hibernatable, auto-response ping, challenge Ed25519, satu socket
  per akun setelah auth), daftar room + `touch`/`event` antar-inbox (D-001), penjaga akun mati, alarm hangus;
  RoomDO (`init`, `send`, `sync`, `opened`, `purge`, alarm lebur/upload/hangus, anti-replay `opNonce`, batas 200 pesan).
- Test: 79 di relay (35 baru). Mutasi manual pada 11 pemeriksaan: semuanya tertangkap setelah dua test ditambahkan
  (lawan yang menghapus akun; event ke socket yang belum terautentikasi).
- Keputusan baru: D-013 (termasuk risiko yang diterima soal routing touch/event).
- Tertunda: `room.retract`/`room.ttl` (W9) dan chunk gambar (W10) masih dibalas `invalid`.

### 2026-10-05 — W6 Web: fondasi & UI statis
- Selesai: token & gaya dasar (PRD §10.2), font self-hosted, `strings.ts`, router di memori, layar Welcome/Register/
  Login/Home/Chat/Verify/Settings/Expired (data contoh), komponen SecretBubble, BurnFx (canvas, reduced-motion),
  AccountClock, TimerPicker, Composer, ContextMenu (klik kanan, tekan lama, Shift+F10, Esc), Watermark; guard
  (sensor saat blur/tersembunyi, blok copy/cut/drag, print); `vercel.json` + preview dengan CSP produksi; `check:inline`.
- Test: 16 unit (format jam, mesin lebur, wrapText, guard) + 8 smoke Playwright (320×568 & 1280×800): semua layar,
  tanpa error konsol, tanpa pelanggaran CSP, tanpa request ke host lain, tanpa scroll horizontal; menu konteks; XSS
  sebagai teks; print & salin diblok.
- Ditemukan & diperbaiki: grid safety number meluber di 320 px; kode demo dev ikut ke bundle produksi; listener
  capture tidak terlepas di EventTarget Node; dua tombol berlabel sama.
- Bundle JS produksi: 27,9 KB gzip.
- Keputusan baru: D-014.
- Langkah manual (opsional): hubungkan repo ke Vercel (Root Directory `apps/web`) untuk preview tampilan statis.

### 2026-10-05 — W7 Web: akun, sesi & koneksi
- Selesai: register (validasi langsung username, kebijakan password, Argon2id di Web Worker), login (integritas vault),
  sesi tahan refresh terikat tab (AES-GCM non-extractable di IndexedDB, state terenkripsi di sessionStorage),
  kunci 10 menit + peringatan 60 dtk, tab duplikat (BroadcastChannel), satu koneksi WebSocket (challenge Ed25519,
  heartbeat, reconnect backoff, 4409/4410), AccountClock dari `remainingMs` server, layar Expired, logout.
- Test: 39 unit web (pelacak aktivitas, pengelola sesi dengan storage palsu, koneksi WS dengan socket palsu) +
  24 E2E dengan relay lokal sungguhan (Chromium 320 px & desktop), stabil 3× berturut-turut; juga lolos di WebKit.
- Ditemukan & diperbaiki: tombol "Keluar" hanya pindah layar tanpa mengakhiri sesi (bug keamanan, ketahuan E2E);
  test flaky karena jam runner vs jam halaman.
- Keputusan baru: D-015.
- Tertunda: daftar room & chat sungguhan (W8); Chat/Verify masih data contoh; hapus akun (W11).

### 2026-10-05 — W8 Chat teks end-to-end
- Selesai: daftar percakapan dari header tersegel (dengan penyaringan entri palsu/hangus), mulai percakapan
  (lookup terverifikasi → room.init → header tersegel dua arah, kasus mulai bersamaan), kirim/terima/dekripsi
  pesan teks, deteksi "dilihat", antrean lebur berurutan, hitung mundur dari `remainingMs` server, event
  `new`/`opened`, koreksi penghitung belum dibuka, buka ulang room setelah refresh, layar Verify dengan safety number.
- Test: 49 unit web (+ penyaringan entri room dengan kripto sungguhan, diuji mutasi) + 34 E2E (7 baru untuk chat
  dengan dua pengguna, di 320 px & desktop).
- Keputusan baru: D-016.

### 2026-10-05 — W9 Batalkan pesan & kesepakatan timer
- Selesai: RoomDO `retract` & `ttl` (usul/setuju/tolak) + event ke lawan; menu konteks "Batalkan pesan"
  (klik kanan, tekan lama, Shift+F10) dengan keterangan "Sudah dilihat…"; tombstone "Pesan dibatalkan";
  panel usulan timer di header, banner Setuju/Tolak, "Menunggu persetujuan…", usulan bertahan setelah refresh.
- Test: 88 di relay (8 baru, 4 pemeriksaan diuji mutasi: semuanya tertangkap) + 42 E2E (4 baru: batalkan di kedua
  sisi & server, menu hanya pesan sendiri, keyboard, timer hanya berlaku setelah disetujui, mulai bersamaan).
- Keputusan baru: D-017.

### 2026-10-05 — W10 Gambar
- Selesai: relay `putChunk`/`getChunk` + frame biner + kuota 150 MB/akun + batas 30 MB/room + notifikasi saat chunk
  terakhir (rute di header chunk, D-018); client: proses gambar (canvas, ≤ 1600 px, WebP/JPEG ≤ 1,5 MB, EXIF hilang),
  enkripsi chunk, upload 2 paralel dengan progres, batalkan saat upload, unduh + dekripsi + cek hash saat tampil,
  render di `<canvas>` (tinggi ≤ 60% layar), lebur gambar + caption, lampiran lewat tombol, tempel, dan drag & drop.
- Test: relay 96 (9 baru; 5 pemeriksaan diuji mutasi, semuanya tertangkap), web 54 unit + 2 test browser Chromium
  (EXIF/GPS hilang, diuji mutasi), E2E 48 (3 baru: kirim/tampil/lebur gambar, portrait tinggi di 320×568, > 15 MB).
- Ditemukan & diperbaiki: tinggi tampilan gambar dibulatkan ke atas sehingga melewati batas 60% layar.
- Keputusan baru: D-018.

### 2026-10-05 — W11 Kontak, verifikasi, blokir & settings
- Selesai: blob kontak terenkripsi (dekripsi saat sesi mulai, update bertanda tangan berurutan), peringatan kunci
  berubah, safety number + QR + status terverifikasi permanen, blokir (purge + forget + status di blob kontak,
  room dari akun terblokir disaring otomatis), ganti password (bukti password lama lokal, kontak dienkripsi ulang),
  hapus akun (purge semua room dengan progres → DELETE).
- Test: relay 97 (+ blob kontak harus kelipatan 4 KB), web 55 unit (+ room akun terblokir disaring) + 2 browser,
  E2E 58 (5 baru: safety number sama & verifikasi tersimpan, blokir, ganti password, hapus akun, username didaftarkan
  ulang → peringatan kunci berbeda).
- Ditemukan & diperbaiki: setelah room lama dilupakan karena lawan berganti kunci, pengguna tidak langsung ditawari
  percakapan baru.
- Keputusan baru: D-019.
