# CLAUDE.md — BlackChat

## Proyek
BlackChat = web chat rahasia 1-lawan-1 dengan enkripsi end-to-end. Daftar cukup username + password.
Akun hangus otomatis 72 jam setelah dibuat. Setiap pesan (teks/gambar) melebur 3/5/7/10 detik setelah dilihat penerima.
Server hanya pernah melihat ciphertext dan tidak menyimpan siapa bicara dengan siapa.

Dokumen acuan (urutan prioritas jika bertentangan):
1. docs/DECISIONS.md — keputusan yang mengoreksi/melengkapi PRD (D-001 dst.)
2. BLACKCHAT_PRD.md — spesifikasi lengkap (dirujuk sebagai PRD §N)
3. docs/BLACKCHAT-WAVES.md — rencana kerja per gelombang (W0–W12) + gerbang

## Aturan Emas (tidak boleh dilanggar — ringkasan PRD §12)
1. Server tidak pernah menerima plaintext: isi pesan, gambar, vault, kontak, header room semuanya ciphertext.
2. Tidak ada data di server yang menautkan dua akun dalam bentuk terbaca. InboxDO menyimpan `inboxRoomId`
   yang berbeda per pemilik (D-001), RoomDO hanya menyimpan `member_tag` + `member_key`. Dilarang menyimpan
   IP, user agent, waktu login, atau pemetaan userId ↔ userId di storage mana pun.
3. Dilarang menulis algoritma kripto sendiri. Client: libsodium lewat packages/crypto. Relay: WebCrypto
   (Ed25519, SHA-256) + @noble/hashes khusus BLAKE2b (D-007).
   Semua label domain separation ada di packages/protocol/src/constants.ts.
4. Dilarang `console.*` (relay & web produksi), `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`,
   `eval`, `new Function`, `{@html}`.
5. Storage browser yang diizinkan HANYA: tema & bahasa (`bc.theme`, `bc.lang`, D-024) di localStorage; `bc.tab`, `bc.sess`, `bc.view` di sessionStorage;
   sessionKey non-extractable di IndexedDB `sessions`. Isi pesan/gambar tidak pernah menyentuh storage.
6. Semua `Uint8Array` rahasia di-`memzero` setelah dipakai. Semua perbandingan rahasia constant-time.
7. Semua input jaringan divalidasi di packages/protocol/src/validate.ts sebelum diproses. Tidak valid = tolak.
8. Penghapusan di server (lebur, batal, purge, hangus) menghapus record DAN chunk dalam satu transaksi.
9. Tidak ada kolom/field terbaca server yang tidak mutlak dibutuhkan untuk routing, penghapusan, atau rate limit.
10. Tidak ada analytics, error tracking, CDN font/script, atau request jaringan selain origin sendiri dan relay.
    Tidak ada username/userId/roomId di URL.

## Stack (versi persis dipin di W0 — jangan upgrade tanpa izin)
pnpm 9 · Node 22 · TypeScript strict · Vite + Svelte 5 (SPA) · CSS murni · libsodium-wrappers-sumo ·
Cloudflare Workers + Durable Objects (SQLite) + D1 + Cron · wrangler · Vitest · @cloudflare/vitest-pool-workers ·
Playwright · GitHub Actions · Vercel (statis).

## Struktur
apps/web (SPA) · apps/relay (Worker + InboxDO, RoomDO, LimiterDO) · packages/protocol (tipe, konstanta,
validator, encoding) · packages/crypto (semua operasi kripto client) · e2e/ · docs/

## Perintah
pnpm dev (vite + wrangler dev) | pnpm build | pnpm lint | pnpm typecheck | pnpm test
pnpm test:relay | pnpm test:e2e | pnpm check:inline (dist/index.html tanpa inline script/style)

## Konvensi
- Teks UI dua bahasa (D-024): Inggris (default, `lib/strings.en.ts`) dan Indonesia (`lib/strings.id.ts`), sentence case.
  Komponen membaca lewat `lib/strings.ts`; setiap teks baru wajib ada di kedua kamus.
- Setiap fungsi crypto, validator, dan operasi relay wajib punya test. Test negatif (input cacat, proof salah,
  replay, akun hangus) sama pentingnya dengan test positif.
- Waktu di relay hanya lewat apps/relay/src/clock.ts (bisa dimajukan di test, D-006). Server mengirim
  `remainingMs`, bukan timestamp absolut. Client menghitung mundur dengan performance.now().
- Dependensi baru wajib dipin dan dicatat alasannya di README.md.

## Protokol Kerja per Gelombang
1. Baca bagian gelombang yang diminta di docs/BLACKCHAT-WAVES.md, § PRD yang dirujuk, dan docs/DECISIONS.md.
2. Tulis rencana singkat (file yang dibuat/diubah, urutan) sebelum menulis kode.
3. Kerjakan HANYA cakupan gelombang itu. Jangan mengerjakan gelombang berikutnya.
4. Jika spesifikasi ambigu atau bertentangan, pilih opsi paling sederhana yang memenuhi Aturan Emas,
   catat di docs/DECISIONS.md (entri D-xxx baru), dan sebutkan di laporan akhir.
5. Jalankan semua perintah Gerbang (lokal, lalu CI di GitHub). Perbaiki sampai lulus.
6. Perbarui docs/PROGRESS.md (gelombang, yang selesai, yang tertunda, langkah manual untuk user).
7. Commit dengan pesan yang disebut di gelombang di branch wN-*, push, buka PR. Lalu BERHENTI dan laporkan
   (link PR + status CI + ringkasan keputusan baru).
