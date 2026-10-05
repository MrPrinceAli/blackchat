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

## D-009 — Format wire protokol (2026-10-04)
**Konteks:** PRD §5.2 dan §6.5 menyebut frame dan endpoint, tetapi tidak menetapkan encoding, cakupan bukti member, atau bentuk `result`.
**Keputusan:**
- **Encoding:** base64url tanpa padding untuk nilai biner, hex huruf kecil untuk `roomId`/`inboxRoomId`/`memberTag`, base32 Crockford huruf besar untuk `userId`. Semua decoder hanya menerima bentuk kanonik (satu nilai = satu string). AEAD di wire = `nonce(24) || ciphertext || tag(16)`.
- **Frame room** berbentuk `{t, reqId, op, auth, ...route}`. `op` adalah objek yang diverifikasi RoomDO; `auth = {memberTag, opNonce, proof}` mencakup **hanya** `opHash = BLAKE2b-256(bc-op-v1 || canonical(op))`. Field routing (`peerUserId`, `peerInboxRoomId`, `myInboxRoomId`, header tersegel) hanya untuk InboxDO dan tidak masuk bukti.
- **Handshake WS:** server mengirim `{t:"challenge", nonce}`, client menjawab `{t:"auth", sig}`, server membalas `{t:"ready", remainingMs}`. `ping` tanpa `reqId` agar cocok dengan `setWebSocketAutoResponse`.
- **Header tersegel** di-pad ke 512 byte sebelum disegel (selalu 560 byte), supaya panjang username tidak bocor.
- **Hasil sync** hanya membawa satu kunci per pesan (`key` = `keyForSelf` jika `mine`, selain itu `keyForPeer`).
- **`room.ttl` accept/reject** membawa nilai ttl yang dijawab, agar tidak menyetujui usulan yang sudah berganti.
- **Event** ke client memakai `inboxRoomId` milik penerima (D-001). Payload dibuat oleh InboxDO dari hasil operasi, bukan diteruskan dari client.
- **`room.getChunk`** dibalas dengan `result` JSON berisi chunk base64url (bukan frame biner kedua). Upload tetap frame biner PRD §13.2, dan relay menolak data chunk yang tidak tepat `IMAGE_CIPHER_CHUNK_BYTES`.
- Request akun bertanda tangan (`contacts`, `password`, `DELETE`) membawa `userId` agar server bisa menemukan akun dan kunci verifikasinya.
**Konsekuensi:** Tipe di `packages/protocol/src/types.ts`, validator di `validate.ts`, frame biner di `frames.ts`. Perubahan format setelah ini wajib entri D baru.

## D-010 — Detail kripto inti (2026-10-04)
**Konteks:** PRD §4.2–§4.4 dan §4.8 tidak menetapkan beberapa detail yang memengaruhi kompatibilitas.
**Keputusan:**
- **Password dinormalisasi NFC** sebelum Argon2id dan sebelum cek kebijakan, supaya password yang sama diketik di perangkat/keyboard berbeda (é tersusun vs é terurai) menghasilkan kunci yang sama.
- **Daftar password umum:** PRD meminta "1.000 password paling umum". Karena password < 10 karakter sudah ditolak, dari top-1.000 hanya 12 entri yang relevan. Dipakai SecLists `xato-net-10-million-passwords-10000.txt` (MIT), hanya entri ≥ 10 karakter, huruf kecil, tanpa duplikat (145 entri, ±1,7 KB) di `packages/crypto/src/common-passwords.ts`. Perbandingan tidak peka huruf besar/kecil.
- **Vault** berisi `edSk(64) || xSk(32)`; kunci publik diturunkan ulang dari kunci rahasia saat login (`identityFromSecretKeys`).
- **Identitas** dibuat dari dua seed acak 32 byte (`crypto_sign_seed_keypair`, `crypto_box_seed_keypair`), jalur kode yang sama dengan vektor uji.
- **Safety number:** hash 256-bit dibaca sebagai bilangan big-endian, diambil `mod 10^60`, di-pad nol ke 60 digit, dipecah 12 × 5. Bias modulo diabaikan (2^256 ≫ 10^60).
- **Vektor uji** (`packages/crypto/test/vectors.json`) dibuat oleh `test/vectors.gen.mjs` yang memanggil libsodium langsung tanpa kode `src/`, lalu diperiksa silang dengan `@noble/hashes` (Argon2id, BLAKE2b) dan `node:crypto` (Ed25519).
**Konsekuensi:** Mengubah salah satu poin di atas memutus login akun yang sudah ada dan wajib entri D baru + regenerasi vektor.

## D-011 — Detail kripto room & pesan (2026-10-04)
**Konteks:** PRD §4.5–§4.7 menulis AAD sebagai `"bc-msg-v1" || roomId || msgId` tanpa menetapkan encoding, dan tidak menyebut pemeriksaan untuk kunci lawan yang tidak valid atau header yang tidak konsisten.
**Keputusan:**
- **AAD memakai byte mentah**, bukan string: body = `utf8("bc-msg-v1") || roomId(32 byte) || msgId(16 byte)`, chunk = `utf8("bc-img-v1") || roomId(32) || msgId(16) || u32be(index)`. Panjang tetap, jadi tidak ambigu.
- **Plaintext pesan** = `canonical(Inner)` lalu `sodium_pad` 256. Tanda tangan Inner = `Ed25519(edSk, utf8("bc-inner-v1" + canonical(Inner tanpa sig)))`.
- **`deriveRoom` menolak** kunci publik X25519 berorde rendah (hasil DH nol) dan room dengan edPk sendiri.
- **`openHeader` memeriksa konsistensi** header: `peerUserId` harus sama dengan `userId` dari `peerEdPk`, dan `peerXPkSig` harus valid. Header palsu ditolak walaupun berhasil didekripsi.
- **`decryptMessage` menerapkan aturan PRD §4.7** di dalam satu fungsi: pengirim yang diharapkan (lawan untuk pesan masuk, diri sendiri untuk pesan sendiri), `roomId`/`msgId` di Inner harus sama dengan record. Pemeriksaan ini tetap perlu walaupun AAD sudah mengikat keduanya, karena pengirim curang bisa membungkus ulang Inner sah dari room lain dengan AAD yang benar (ada test-nya).
- **Vektor room** (`packages/crypto/test/vectors-room.json`) dibuat oleh generator independen dan menjadi acuan relay di W5 untuk memverifikasi bukti member dengan `@noble/hashes` (D-007).
**Konsekuensi:** Lima pemeriksaan keamanan utama diuji dengan mutasi manual (pemeriksaan dihapus → test gagal): pengirim Inner, roomId/msgId Inner, hash gambar, userId header, dan pemisahan inboxRoomId (D-001).

## D-012 — Detail relay akun & limiter (2026-10-05)
**Konteks:** Implementasi W4 menemukan beberapa hal yang tidak diatur PRD, plus satu batasan toolchain.
**Keputusan:**
- **Kunci limiter diturunkan dari `SALT_SECRET`**, bukan dari salt acak di memori seperti tertulis di D-003: `hex(BLAKE2b-256(key=SALT_SECRET, "bc-limit-ip-v1"|"bc-limit-user-v1" || nilai))`. Cloudflare menjalankan banyak isolate; salt acak per isolate membuat IP yang sama masuk ke penghitung berbeda dan rate limit bisa dilewati. Dengan kunci rahasia yang stabil, IP/username tetap tidak pernah disimpan dan tidak bisa dibalik tanpa `SALT_SECRET`.
- **Riwayat gagal login** per username dilupakan setelah 1 jam tanpa percobaan baru (memori DO tetap terbatas). Jeda tetap 30 dtk × 2^(n−5), maks 15 menit.
- **`GET /v1/account/salt`** memakai kuota lookup (30/menit/IP), bukan kuota login, supaya satu percobaan login tidak terhitung dua kali.
- **HTTP:** request dengan `Origin` selain `ALLOWED_ORIGIN` ditolak 403 sebelum diproses; request tanpa `Origin` (bukan browser) diizinkan. Body wajib `Content-Type: application/json` (memaksa preflight CORS) dan ≤ 64 KiB. Kode error → status: invalid 400, unauthorized/bad_proof 401, forbidden 403, not_found 404, conflict/replay/room_full/quota_exceeded 409, expired 410, rate_limited 429 (+`Retry-After`), internal 500. Semua kegagalan tanda tangan (register, update) → 401.
- **Update bertanda tangan** (`contacts`, `password`, `DELETE`) membalas `{}`; `UPDATE … WHERE seq = <lama>` mencegah dua update bersamaan dengan seq sama.
- **`SALT_SECRET` wajib 32 byte hex**; selain itu relay membalas 500 untuk semua request yang memerlukannya (gagal tertutup).
- **`compatibility_date` = 2026-08-22** (PRD §11.2: 2026-10-01). Runtime workerd di `@cloudflare/vitest-pool-workers` 0.22 (versi terbaru saat ini) hanya mendukung sampai 2026-08-22. Tanggal yang sama dipakai untuk test dan produksi agar yang diuji sama dengan yang di-deploy. Naikkan bersama paket itu.
- **Route test** (`/__test/clock`, `/__test/cron`) ada di `src/test-routes.ts` dan hanya dimuat saat `__BC_TEST__`. `tooling/check-relay-bundle.js` (dijalankan di CI) memastikan bundle produksi tidak memuatnya; dibuktikan dengan kontrol negatif (bundle env test ditolak).
**Konsekuensi:** D-003 dikoreksi oleh poin pertama. Test relay berjalan di workerd lewat `@cloudflare/vitest-pool-workers`.

## D-013 — Detail InboxDO & RoomDO (2026-10-05)
**Konteks:** PRD §6.1–§6.3 tidak mengatur beberapa perilaku yang menentukan keamanan relay realtime.
**Keputusan:**
- **Satu socket per akun, ditegakkan setelah autentikasi.** Socket lama baru ditutup (4409) setelah socket baru lolos challenge Ed25519. Socket yang belum terautentikasi dibatasi 4 per inbox (yang tertua ditutup 4401), tidak menerima event, dan tidak bisa memutus pemilik akun.
- **Penjaga akun mati:** tabel InboxDO baru dibuat setelah akun terbukti hidup di D1 (saat connect atau `touch`). Akun tidak ada/hangus → socket ditutup 4410 dan storage dikosongkan. Tabel RoomDO baru dibuat oleh `init`; operasi lain pada room kosong tidak menulis apa pun.
- **`room.send` memeriksa lawan masih hidup** di D1 sebelum menyimpan pesan, sehingga pesan untuk akun yang sudah dihapus tidak pernah tersimpan.
- **RPC antar-DO** mengembalikan `{ok, value} | {ok:false, error}`, bukan exception (kelas error hilang di batas RPC). RoomDO memvalidasi ulang op & auth, dan menolak op yang `roomId`-nya bukan nama DO itu.
- **Timer record = min(ttl pesan, ttl room yang berlaku)**, sehingga timer pesan tidak pernah lebih lama dari yang disepakati. `seq` diambil dari penghitung `next_seq` yang tidak pernah turun (tidak dipakai ulang setelah pesan dihapus).
- **`room.init` menyentuh inbox lawan dengan unread 0**, jadi percakapan muncul di daftar lawan sebelum pesan pertama. `touch` tidak pernah menimpa header entri yang sudah ada; unread dibatasi 200; inbox maksimal 1000 room.
- **Notifikasi pesan gambar** dikirim setelah semua chunk masuk (W10); di W5 hanya pesan tanpa chunk yang memicu `new`.
- **Frame `expiring` tidak dikirim server.** Sisa umur akun dikirim di `ready` (`remainingMs`), dan client menghitung peringatan 24 jam/1 jam/5 menit sendiri (PRD §10.3, §13.3).
**Risiko yang diterima (dicatat untuk SECURITY.md di W12):** karena InboxDO tidak tahu siapa lawan bicara (PRD §2.1 prinsip 3), anggota room mana pun bisa mengarahkan `touch`/`event` ke inbox yang ia sebut. Akibatnya terbatas pada: menaikkan penghitung belum dibuka, mengirim event palsu, atau menambah entri room berisi header sampah di daftar korban (maks 1000, dibatasi 30 kirim/menit). Isi pesan tetap aman. Client wajib mengabaikan event untuk `inboxRoomId` yang tidak dikenal dan melupakan entri yang headernya gagal dibuka (`openHeader`).

## D-014 — Detail web fondasi (2026-10-05)
**Konteks:** PRD §10–§11 menyisakan beberapa detail implementasi untuk SPA dan header keamanan.
**Keputusan:**
- **`vercel.json` menyimpan placeholder `RELAY_HOST`** sampai W12. PRD §11.1 menyebut placeholder diganti "saat build", tetapi Vercel membaca `vercel.json` sebelum build berjalan, jadi nilainya harus ditulis langsung di file. W12 mengganti placeholder dengan host relay produksi (langkah manual tercatat). `apps/web/security-headers.js` membaca `vercel.json` yang sama dan dipakai server preview Vite, sehingga smoke/E2E berjalan di bawah CSP yang sama dengan produksi. Untuk relay lokal `http://`, `upgrade-insecure-requests` dan HSTS dihilangkan.
- **Tema:** gelap jika tidak ada preferensi, mengikuti `prefers-color-scheme`, dan bisa dipaksa di Settings (`localStorage` kunci `bc.theme`, satu-satunya data di sana).
- **Font:** hanya subset Latin variabel dari Fontsource (Instrument Sans, Martian Mono; OFL, lisensi di `public/fonts/`). Aksara lain memakai font sistem.
- **Efek lebur:** bubble digambar ulang ke canvas dengan `fillText` memakai gaya terhitung (bukan snapshot DOM), lalu dipecah per sel 4 px. Logika partikel ada di `lib/burn.ts` (fungsi murni, diuji).
- **CSP & Svelte:** tidak ada atribut `style="..."` di template; gaya dinamis hanya lewat direktif `style:` (CSSOM, diizinkan CSP). Smoke test memeriksa event `securitypolicyviolation`.
- **Overlay sensor** (`.concealed-overlay`) murni visual (`pointer-events: none`).
- **Kode khusus dev** (halaman demo lebur) dijaga dengan `import.meta.env.DEV && …` di posisi pertama kondisi supaya minifier membuangnya dari bundle produksi.
- **Layar statis W6** memakai data contoh (`lib/sample.ts`) yang diganti di W7/W8. Layar Expired belum bisa dicapai dari alur statis; diuji di W7.
**Konsekuensi:** bundle JS produksi 27,9 KB gzip (batas PRD §10.7: 100 KB, tanpa libsodium).

## D-015 — Detail akun, sesi & koneksi web (2026-10-05)
**Konteks:** PRD §5.4 dan §13 menetapkan perilaku sesi dan koneksi, tetapi tidak semua mekanismenya.
**Keputusan:**
- **Argon2id berjalan di Web Worker** dan libsodium dimuat malas (chunk terpisah). Durasi terukur di E2E (Apple Silicon): Chromium ±168 ms, WebKit (profil iPhone 13) ±186 ms. Bundle utama tanpa libsodium: 36,9 KB gzip.
- **Login memeriksa integritas vault:** kunci publik yang diturunkan dari vault harus sama dengan `edPk`/`xPk`/`userId` dari server; jika tidak, login ditolak.
- **Tab duplikat** dideteksi lewat `BroadcastChannel("bc-tab")`: saat dimuat, tab bertanya "siapa memegang tabId ini?" (tunggu 150 ms). Ada jawaban → tab duplikat → tabId & sessionKey baru, entri tab asli tidak disentuh. Tidak ada jawaban → refresh biasa → tabId lama dipakai lagi. Tab yang socket-nya diambil alih (4409) menampilkan "Akun ini sedang dibuka di tab lain." + "Gunakan di sini".
- **Sisa umur akun setelah refresh** memakai `expiresAtLocal` (jam perangkat, disimpan terenkripsi) sampai `ready.remainingMs` dari server tiba dan mengoreksinya.
- **WebSocket:** 4409 → `replaced` (tanpa reconnect otomatis); 4410 → layar Expired; 4401 dan putus jaringan → reconnect dengan backoff. Jika relay menolak handshake (misal akun sudah hangus), client terus mencoba sampai jam umur akun lokal habis lalu menampilkan Expired (diterima).
- **Aktivitas** (`pointerdown`, `keydown`, `wheel`, `touchstart`, `scroll`) didengar di fase capture, pasif. Pengecekan kunci tiap 15 dtk dan saat `visibilitychange`/`focus`.
- **E2E memakai relay lokal sungguhan** (`pnpm --filter @blackchat/relay e2e:serve`: `wrangler dev --env test`, D1/DO lokal yang dikosongkan tiap run). Route test baru `POST /__test/reset-limits` (method `LimiterDO.reset` tidak melakukan apa pun di produksi). E2E dijalankan satu worker karena jam relay dan rate limit dipakai bersama. Project WebKit opsional (`E2E_WEBKIT=1`).
- **Belum aktif di W7:** daftar room & chat sungguhan (W8), hapus akun (W11; tombolnya dinonaktifkan), Verify (W11).
**Konsekuensi:** Seluruh kriteria sesi PRD §15.2 (refresh, kunci 10 menit, refresh setelah tidak aktif, tab baru, tab duplikat, storage kosong setelah kunci/logout) diuji E2E di Chromium (320 px & desktop) dan WebKit.

## D-016 — Detail chat teks (2026-10-05)
**Konteks:** Implementasi PRD §7–§8 di client, plus penyaringan yang dijanjikan D-013.
**Keputusan:**
- **Entri room disaring di client.** Header dibuka dengan kunci sendiri, lalu kunci room diturunkan ulang dari header; `inboxRoomId` hasilnya harus sama dengan entri. Entri dengan header gagal dibuka, `inboxRoomId` tidak cocok (entri palsu; siapa pun bisa menyegel header ke kunci publik kita), atau lawan yang sudah hangus langsung di-`rooms.forget`. Event untuk `inboxRoomId` yang tidak dikenal hanya memicu muat ulang daftar.
- **Data lookup diverifikasi** sebelum membuat room: `userId` harus sesuai `edPk`, dan `xPkSig` valid.
- **Saat membuka room**, lawan di-lookup ulang. Tidak ada, atau `edPk` berbeda → room dilupakan + "Akun @x sudah tidak ada." Dua entri dengan username sama → yang lebih cepat hangus dilupakan.
- **Sinkron penuh (`sinceSeq = 0`)** setiap membuka room dan setiap koneksi siap kembali. Maksimal 200 pesan per room, dan cara ini sekaligus mendeteksi pesan yang sudah lebur atau dibatalkan saat offline (PRD §8 menyebut `sinceSeq = lastSeq` untuk reconnect; sinkron penuh lebih sederhana dan lebih benar).
- **Syarat "dilihat"** = 50 % bubble di viewport, **atau** bubble menutupi ≥ 50 % tinggi viewport (pesan 2000 karakter di layar 320 px tetap bisa memicu timer), ditambah tab terlihat & fokus.
- **Antrean:** pesan masuk terdepan = seq terkecil yang belum dibuang. Pesan di belakangnya disensor sampai yang terdepan selesai melebur termasuk animasi dan label "Dilebur".
- **Pesan terkirim selalu membawa `sealedHeaderForPeer`**, sehingga room muncul lagi di daftar lawan walau lawan pernah melupakannya.
- **Room terakhir** (`inboxRoomId` sendiri) disimpan terenkripsi di sesi; refresh membukanya kembali setelah koneksi siap.
- **Menu konteks** dinonaktifkan sampai W9 (batalkan pesan). Pesan gambar diabaikan sampai W10. Blokir dan penyimpanan status verifikasi di W11. Layar Verify sudah menampilkan safety number sungguhan.
**Konsekuensi:** Kriteria PRD §15.2 untuk chat teks diuji E2E dengan dua pengguna (320 px & desktop): pesan saat offline, timer saat terlihat ±500 ms dua arah, tab ditutup, 5 pesan berurutan, XSS, refresh room + timer akurat, dan username yang didaftarkan ulang.

## D-017 — Detail batalkan pesan & kesepakatan timer (2026-10-05)
**Keputusan:**
- **Batalkan:** hanya pengirim (`from_tag`), selama pesan belum melebur (`burn_at` belum lewat), termasuk pesan yang sudah dibuka. Record + chunk dihapus dalam satu transaksi; lawan menerima event `retracted`. Di client, pesan sendiri hilang langsung. Di sisi lawan, plaintext langsung dibuang dan bubble menampilkan "Pesan dibatalkan" selama 3 dtk. Menu hanya muncul untuk pesan sendiri yang sudah terkirim (`delivered`/`opened`); pembatalan saat upload gambar menyusul di W10.
- **Timer:** usulan disimpan di `settings` RoomDO (`pending_ttl`, `pending_by` = memberTag pengusul). Usulan baru dari pihak mana pun menggantikan yang lama. Usulan yang sama dengan timer berlaku ditolak (`invalid`). Jawaban harus dari anggota lain (`forbidden`) dan harus menyebut nilai usulan yang masih berlaku (`conflict` jika berganti). `accept` mengubah timer room; `reject` hanya membersihkan usulan. Event: `ttl_proposed`, `ttl_changed`, `ttl_rejected`. `sync` membawa `pendingTtl` (dengan `mine`) sehingga usulan tetap terlihat setelah refresh.
- **Pesan yang sudah terkirim tidak berubah timernya** setelah timer room diganti: setiap pesan membawa ttl-nya sendiri (PRD §7.3), dan antrean tetap berurutan.

## D-018 — Detail gambar (2026-10-05)
**Keputusan:**
- **Header frame biner chunk membawa rute lawan** (`peerUserId`, `peerInboxRoomId`, opsional `sealedHeaderForPeer`) di setiap chunk. Batas header dinaikkan dari 1 KB ke 2 KB (frame tetap ≤ 300 KB). Relay memberi tahu lawan (`touch` +1 lalu `new`) saat chunk terakhir masuk, tanpa pernah menyimpan rute itu. Alternatifnya, menyimpan rute di storage InboxDO selama upload, berarti menyimpan relasi antar-akun (PRD §12 aturan 3).
- **`putChunk`:** hanya pengirim pesan; data harus tepat `IMAGE_CIPHER_CHUNK_BYTES` (frame lain ditutup 4400); idx < jumlah chunk; chunk duplikat ditolak; total chunk room ≤ 30 MB (`room_full`). **Kuota akun 150 MB** dihitung di InboxDO (`uploaded_bytes`, ikut terhapus saat akun hangus). Rate limit 60 chunk/menit/akun.
- **`getChunk`:** kedua anggota boleh, hanya untuk pesan yang sudah lengkap dan belum melebur. Dikirim sebagai `result` JSON base64url (D-009).
- **Client:** gambar diunduh saat pesannya tampil, bukan saat masih antre. Timer baru bisa mulai setelah gambar tergambar di `<canvas>`. Tinggi tampilan ≤ 60% layar, dibulatkan ke bawah. `contentKey` gambar dan byte pratinjau milik sendiri hanya di memori, di-wipe saat pesan dibuang. Upload maks 2 chunk bersamaan dengan progres di bubble; membatalkan saat upload menghentikan sisa unggahan lalu `retract`. Upload yang gagal (kuota, room penuh) dibatalkan otomatis. Caption = teks yang sedang diketik di composer saat gambar dipilih/ditempel/dijatuhkan.
- **Pemrosesan:** `createImageBitmap(file, { imageOrientation: 'from-image' })` → canvas (sisi ≤ 1600 px) → WebP 0,8 (JPEG 0,85 jika browser tidak punya encoder WebP), kualitas turun 0,1 per langkah sampai 0,4, lalu dimensi diperkecil 20% jika masih > 1,5 MB.
- **Test browser sungguhan:** Vitest browser mode (Chromium lewat `@vitest/browser-playwright`) untuk `images.browser.test.ts`, yang membuktikan EXIF/GPS hilang dari byte yang dikirim (diuji mutasi). CI memasang Chromium sebelum `pnpm test`.

## D-019 — Detail kontak, blokir, ganti password, hapus akun (2026-10-05)
**Keputusan:**
- **Blob kontak** didekripsi saat sesi dimulai. Gagal dibuka → daftar kosong (tidak memblokir login). Update bertanda tangan (`contacts`, `password`, `DELETE`) diantrekan satu per satu agar `seq` naik berurutan.
- **Kontak dicatat saat memulai percakapan.** Username sama dengan kunci berbeda → peringatan "@x sekarang memakai kunci berbeda…" (PRD §10.6) dan kontak lama diganti. Status terverifikasi hanya dipertahankan jika kuncinya sama. Pencarian yang membuka room lama dengan lawan yang sudah tidak ada atau berganti kunci langsung menawarkan percakapan baru.
- **Blokir:** `room.purge` → `rooms.forget` → `blocked: true` di blob kontak (server tidak tahu siapa memblokir siapa). Room dari akun yang diblokir yang muncul lagi (lawan mengirim pesan baru) di-purge dan dilupakan diam-diam saat daftar dimuat. Memulai percakapan baru dengan akun itu membatalkan blokir.
- **Ganti password** meminta password sekarang. Kebenarannya dibuktikan dengan menurunkan ulang `vaultKey` dari salt server dan membandingkannya constant-time dengan `vaultKey` aktif (tanpa mengirim apa pun ke server). Urutan: `PUT password` (salt, authKey, vault baru), lalu `PUT contacts` (blob dienkripsi ulang dengan `vaultKey` baru). Jika langkah kedua gagal, blob lama tidak bisa dibuka dan dianggap kosong (diterima, dicatat di SECURITY.md).
- **Hapus akun:** muat ulang daftar room → `room.purge` di setiap room dengan progres "Menghapus percakapan… n/total" → `DELETE /v1/account` → logout.
- **QR safety number:** `qrcode-generator` (MIT, tanpa `innerHTML`/`eval`), modul QR digambar sendiri ke canvas. Isi QR = 60 digit (mode numerik).

## D-020 — Rilis & domain (2026-10-05)
**Konteks:** `blackchat.vercel.app` (nilai `ALLOWED_ORIGIN` di PRD §11.2) sudah dipakai orang lain. Domain web dan relay baru diketahui setelah akun Vercel/Cloudflare dibuat.
**Keputusan:**
- **Domain dikonfigurasi dengan satu perintah** (`pnpm configure-domains --web … --relay …`): mengisi host relay di CSP `apps/web/vercel.json` dan `ALLOWED_ORIGIN` produksi di `apps/relay/wrangler.toml` (env test tidak tersentuh). Skrip memvalidasi origin `https://` tanpa path dan bisa dijalankan ulang untuk ganti domain. Header preview untuk E2E menerima placeholder maupun host produksi.
- **`deploy-relay.yml`** (push `main` yang mengubah relay/protokol, atau manual): dilewati dengan notice selama secret Cloudflare belum diisi; gagal jika `database_id` D1 masih placeholder; menjalankan test relay, migrasi D1 `--remote`, lalu `wrangler deploy`.
- **`release-hash.yml`** (tag `v*`): build web dengan repository variable `VITE_RELAY_URL`, SHA-384 setiap file `dist/`, dan GitHub Release berisi `hashes.txt`.
- **Web dideploy oleh integrasi Git Vercel** (Root Directory `apps/web`), bukan dari GitHub Actions, sehingga token Vercel tidak perlu disimpan di repo.
- **`docs/acceptance.md`** memetakan seluruh butir PRD §15.2 ke test yang membuktikannya. **`SECURITY.md`** memuat model ancaman PRD §14 dengan status terbaru dan batasan yang diterima.
