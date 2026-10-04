# DECISIONS — BlackChat

Catatan keputusan saat spesifikasi ambigu, bertentangan, atau perlu disesuaikan. Format: konteks → keputusan → konsekuensi.
Jika bertentangan dengan `BLACKCHAT_PRD.md`, **dokumen ini yang berlaku**. Entri terbaru ditambahkan di bawah. Tanggal dalam ISO 8601.

---

## D-001 — ID room di InboxDO berbeda per pemilik (2026-10-04)
**Konteks:** PRD §6.1 menyimpan `room_id` apa adanya di tabel `rooms` setiap InboxDO. `room_id` yang sama muncul di inbox A dan inbox B, sehingga operator yang membaca storage DO bisa mencocokkan semua inbox dan menyusun grafik sosial lengkap. Ini bertentangan dengan tujuan PRD §1.1 ("tidak ada tabel yang menyatakan A berbicara dengan B") dan risiko #11 yang ditandai "Dicegah".
**Keputusan:**
- Tambah turunan baru di PRD §4.6:
  `inboxRoomId_X = hex(BLAKE2b-256(key=shared, "bc-inbox-room-v1" || edPk_X))`.
- Kolom `rooms.room_id` di InboxDO menyimpan `inboxRoomId` milik pemilik inbox, **bukan** `roomId`. `roomId` asli hanya dipakai sebagai nama RoomDO (`room:<roomId>`).
- Frame WS yang memicu notifikasi ke lawan (`room.init`, `room.send`, `room.opened`, `room.retract`, `room.ttl`) membawa `roomId` (untuk RoomDO), `myInboxRoomId`, dan `peerInboxRoomId` (untuk `touch`/`event` ke InboxDO lawan). A bisa menghitung `peerInboxRoomId` karena tahu `shared` dan `edPk_B`.
- Frame `rooms.setUnread`, `rooms.forget`, dan event server → client memakai `inboxRoomId` milik penerima. Client memetakan `inboxRoomId` → room lewat header tersegel (yang memuat data lawan sehingga `shared` bisa dihitung ulang).
**Konsekuensi:** Storage InboxDO A, InboxDO B, dan RoomDO tidak punya nilai bersama. Relasi hanya terlihat sesaat saat operasi diproses (risiko #12, diterima). Label `bc-inbox-room-v1` masuk `constants.ts`. Test relay wajib memastikan tidak ada nilai `room_id` yang sama di dua InboxDO untuk satu percakapan.

## D-002 — Parameter Argon2id tetap: 64 MiB, opslimit 3 (2026-10-04)
**Konteks:** PRD §4.1 memakai `OPSLIMIT_MODERATE` + `MEMLIMIT_MODERATE` (256 MiB). Di WASM pada HP kelas bawah dan Safari iOS ini rawan gagal alokasi memori, dan durasinya jauh di atas target 1–3 detik di PRD §10.3.
**Keputusan:** `ARGON2_OPSLIMIT = 3`, `ARGON2_MEMLIMIT = 64 * 1024 * 1024`, algoritma `crypto_pwhash_ALG_ARGON2ID13`. Konstanta di `packages/protocol/src/constants.ts`, dipakai sama saat register, login, dan ganti password.
**Konsekuensi:** Brute force offline (risiko #7) lebih murah sekitar 4× dibanding MODERATE, tetapi tetap mahal per tebakan dan password minimal 10 karakter + daftar 1.000 password umum. Jika nanti ingin dinaikkan, parameter harus disimpan bersama salt (perubahan skema), jadi catat sebagai D baru.

## D-003 — Jeda login per username di LimiterDO (2026-10-04)
**Konteks:** PRD §6.4 meminta "5 gagal berturut-turut per username → jeda 30 dtk, berlipat ganda", tetapi kunci LimiterDO hanya `BLAKE2b(IP || salt)`.
**Keputusan:** Dua jenis kunci di LimiterDO: `ip:` + `BLAKE2b(IP || limiterSalt)` dan `user:` + `BLAKE2b(username || limiterSalt)`. `limiterSalt` acak di memori (bukan storage). Shard tetap 16 berdasarkan karakter hex pertama hash. Login sukses mereset penghitung username. Jeda: 30 dtk × 2^(n−5) untuk gagal ke-n ≥ 5, maks 15 menit.
**Konsekuensi:** Tetap tanpa storage. Jika instance DO di-evict, penghitung hilang (diterima; rate limit IP tetap berlaku). Penyerang bisa membuat korban terkunci sementara (maks 15 menit) — diterima, dicatat di SECURITY.md.

## D-004 — Register username yang sudah hangus tapi belum dibersihkan cron (2026-10-04)
**Konteks:** Cron membersihkan D1 tiap 15 menit. Dalam jeda itu, baris lama masih ada dan `username PRIMARY KEY` membuat register ulang gagal, padahal PRD §5.3 mengizinkannya.
**Keputusan:** Handler register menjalankan dalam satu `DB.batch`: `DELETE FROM accounts WHERE username = ? AND expires_at <= ?` lalu `INSERT`. Endpoint ketersediaan username (validasi "Tersedia/Sudah dipakai" di Register) memperlakukan baris hangus sebagai tersedia.
**Konsekuensi:** Username langsung bisa dipakai ulang begitu hangus. InboxDO akun lama tidak terpengaruh karena `userId` baru berbeda (diturunkan dari `edPk` baru).

## D-005 — Pengembangan & test lokal penuh, deploy produksi di W12 (2026-10-04)
**Konteks:** CORS relay hanya mengizinkan satu `ALLOWED_ORIGIN` (PRD §5.2). URL preview Vercel berganti tiap PR, jadi preview tidak bisa bicara dengan relay produksi tanpa melonggarkan CORS.
**Keputusan:** Pengembangan dan gerbang W0–W11 memakai `pnpm dev` (Vite + `wrangler dev`, D1 & DO lokal lewat Miniflare, tanpa Docker) dan CI GitHub Actions (job yang sama di runner). Deploy relay ke Cloudflare dan web ke Vercel produksi dilakukan di W12. Preview Vercel boleh aktif sejak W6 untuk cek tampilan statis saja.
**Konsekuensi:** CORS tetap ketat (satu origin). Gerbang tiap gelombang = perintah lokal + CI hijau, bukan URL preview.

## D-006 — Jam relay yang bisa dimajukan khusus test (2026-10-04)
**Konteks:** Kriteria PRD §15.2 butuh "mock clock" (akun hangus setelah 72 jam, upload terputus terhapus setelah 10 menit). Alarm DO dan cron memakai waktu server sungguhan.
**Keputusan:** Semua waktu di relay lewat `apps/relay/src/clock.ts` (`now()`). Konstanta build `__BC_TEST__` (lewat `define` di `[env.test]` wrangler.toml / konfigurasi vitest) mengaktifkan offset waktu dan route `POST /__test/clock` serta pemicu alarm/cron manual. Di build produksi `__BC_TEST__ = false`, sehingga kode test dibuang saat bundling. CI memastikan bundle produksi tidak mengandung string `__test/`.
**Konsekuensi:** Test akun hangus, lebur, dan upload terputus bisa deterministik. Client E2E memakai `page.clock` Playwright untuk sisi browser.

## D-007 — BLAKE2b di relay memakai @noble/hashes (2026-10-04)
**Konteks:** Relay butuh BLAKE2b keyed untuk salt palsu (PRD §5.2), kunci LimiterDO (PRD §6.4), dan verifikasi member proof (PRD §4.6). WebCrypto tidak menyediakan BLAKE2b. `libsodium-wrappers-sumo` memuat WASM dari byte saat runtime, padahal Workers melarang kompilasi WASM dari byte arbitrer, dan ukurannya besar untuk Worker gratis. PRD §12 aturan 12 hanya menyebut libsodium / WebCrypto.
**Keputusan:** Relay memakai `@noble/hashes` (pustaka teruji dan diaudit, pure JS, versi dipin) khusus untuk BLAKE2b. Ed25519 dan SHA-256 tetap WebCrypto. Client tetap libsodium. Fungsi BLAKE2b relay dibungkus di `apps/relay/src/hash.ts`.
**Konsekuensi:** Ada dua implementasi BLAKE2b (client & relay), jadi wajib ada test kompatibilitas: vektor dari `@blackchat/crypto` (libsodium) harus menghasilkan output identik di `hash.ts` (keyed & unkeyed, panjang 16/20/32 byte). Alasan dependensi dicatat di README.

## D-008 — Label domain separation tambahan (2026-10-04)
**Konteks:** PRD §4.1 meminta semua label `bc-...-v1` ada di `constants.ts`, tetapi beberapa operasi di PRD tidak menyebut labelnya, dan PRD §6.1 memakai ulang `bc-auth-v1` (label turunan `authKey` di §4.3) sebagai awalan pesan challenge WebSocket.
**Keputusan:** Setiap tujuan punya label sendiri:
- `bc-ws-auth-v1` untuk challenge WebSocket (menggantikan `bc-auth-v1` di PRD §6.1).
- `bc-inner-v1` sebagai awalan tanda tangan `Inner` (PRD §4.7).
- `bc-vault-blob-v1` dan `bc-contacts-v1` sebagai AAD AEAD vault dan blob kontak.
- `bc-op-v1` sebagai awalan `opHash`.
- `bc-fake-salt-v1`, `bc-limit-ip-v1`, `bc-limit-user-v1` untuk turunan khusus relay.
- `bc-req-{register,contacts,password,delete}-v1` untuk request akun bertanda tangan (PRD §5.2).
Safety number tetap persis PRD §4.4 (tanpa label).
**Konsekuensi:** Tidak ada satu label pun yang dipakai untuk dua tujuan; test `constants.test.ts` memastikan semua label unik. Ukuran dan label di `packages/protocol/src/constants.ts` adalah satu-satunya sumber nilai.
