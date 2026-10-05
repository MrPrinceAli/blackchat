# Kriteria penerimaan — BlackChat

Pemetaan setiap butir PRD §15.2 ke test yang membuktikannya. Semua test berjalan di CI (`.github/workflows/ci.yml`) pada setiap PR dan push ke `main`.

Lokasi test:
- **E2E**: `e2e/*.spec.ts` (Playwright, relay lokal sungguhan + build produksi dengan CSP produksi; Chromium 320×568 & 1280×800, opsional WebKit).
- **Relay**: `apps/relay/test/*.test.ts` (Vitest di workerd, D1 & Durable Objects lokal, jam bisa dimajukan, D-006).
- **Web**: `apps/web/src/lib/*.test.ts` (unit) dan `*.browser.test.ts` (Chromium sungguhan).

| # | Kriteria (PRD §15.2) | Status | Bukti |
|---|---|---|---|
| 1 | Register hanya dengan username + password; jam umur akun tampil ~72 jam | Lulus | E2E `session.spec.ts` › "register hanya dengan username + password; jam umur ~72 jam; Argon2id terukur" |
| 2 | A mengirim teks saat B offline; B login kemudian dan menerima | Lulus | E2E `chat.spec.ts` › "A kirim saat B offline…"; Relay `rooms.test.ts` › "A kirim saat B offline…" |
| 3 | Timer pesan A baru mulai saat pesan terlihat di layar B; hilang dari DOM kedua pihak setelah 3/5/7/10 dtk (± 500 ms) | Lulus | E2E `chat.spec.ts` › "timer mulai saat terlihat di layar penerima; hilang di kedua sisi setelah ttl ±500 ms, dua arah" (ttl 3), "refresh membuka room yang benar… timer tetap akurat" (ttl 10), `images.spec.ts` (ttl 3), `retract-ttl.spec.ts` (ttl 10 → 3) |
| 4 | Berlaku sebaliknya untuk pesan B ke A | Lulus | E2E `chat.spec.ts` › test butir 3 (bagian "Arah sebaliknya: B → A") |
| 5 | B menutup tab setelah timer mulai → pesan tetap terhapus di server | Lulus | E2E `chat.spec.ts` › "B menutup tab setelah timer mulai…"; Relay `rooms.test.ts` › "pesan yang ditutup di tengah timer tetap terhapus", "alarm melebur pesan pada burn_at…" |
| 6 | Klik kanan pesan sendiri → "Batalkan pesan" menghapus di kedua sisi dan di server | Lulus | E2E `retract-ttl.spec.ts` › "batalkan pesan: hilang di kedua sisi dan di server…", "menu konteks lewat keyboard…"; Relay `rooms.test.ts` › "pengirim membatalkan: record & chunk hilang…" |
| 7 | Klik kanan pesan lawan tidak memunculkan menu | Lulus | E2E `retract-ttl.spec.ts` › test butir 6 (bagian "Klik kanan pesan lawan") |
| 8 | Gambar terkirim, tampil di canvas, EXIF hilang (gambar ber-GPS), melebur sesuai timer | Lulus | E2E `images.spec.ts` › "gambar terkirim, tampil di canvas, melebur sesuai timer di kedua sisi"; Web browser `images.browser.test.ts` › "menghapus EXIF termasuk GPS…" (diuji mutasi) |
| 9 | Usulan timer hanya berlaku setelah disetujui | Lulus | E2E `retract-ttl.spec.ts` › "usulan timer hanya berlaku setelah disetujui; tolak tidak mengubah timer"; Relay `rooms.test.ts` › "kesepakatan timer" |
| 10 | Setelah waktu akun dimajukan melewati 72 jam: login gagal, InboxDO kosong, pesan terkait terhapus | Lulus | Relay `account.test.ts` › "akun hangus ditolak di login, lookup, dan update bertanda tangan", "cron menghapus akun hangus…"; `rooms.test.ts` › "setelah 72 jam: socket ditutup 4410, InboxDO kosong, RoomDO dihapus seluruhnya"; E2E `session.spec.ts` › "akun hangus → layar Expired, sesi dihapus" |
| 11 | Username hangus bisa didaftarkan lagi; lawan bicara lama mendapat peringatan kunci berbeda | Lulus | Relay `account.test.ts` › "username hangus bisa didaftarkan ulang sebelum cron berjalan (D-004)"; E2E `account-ops.spec.ts` › "username didaftarkan ulang: lawan lama mendapat peringatan kunci berbeda" |
| 12 | `<img src=x onerror=alert(1)>` tampil sebagai teks | Lulus | E2E `chat.spec.ts` › "pesan berisi HTML tampil sebagai teks di penerima"; lint `{@html}`/`innerHTML` dilarang (`tooling/check-lint-rules.js`) |
| 13 | Semua chunk gambar di RoomDO berukuran identik, untuk gambar kecil maupun besar | Lulus | Relay `rooms.test.ts` › "semua chunk tersimpan berukuran identik; ukuran lain ditolak…"; Crypto `room.test.ts` › "semua chunk berukuran identik untuk gambar kecil maupun besar" |
| 14 | Tabel `rooms` InboxDO tanpa kolom waktu; tabel `messages` RoomDO tanpa kolom jenis pesan | Lulus | Relay `rooms.test.ts` › "RoomDO tanpa identitas, InboxDO tanpa waktu, tidak ada nilai bersama antar-inbox" |
| 15 | `expiresAt` dari lookup selalu kelipatan 1 jam | Lulus | Relay `account.test.ts` › "expiresAt dibulatkan ke bawah ke jam penuh, tanpa data rahasia"; validator protocol `lookupResponse` |
| 16 | B menerima 5 pesan sekaligus: hanya yang pertama terbaca, sisanya "Menunggu giliran", melebur berurutan | Lulus | E2E `chat.spec.ts` › "5 pesan sekaligus…"; Web `chat.test.ts` › "antrean lebur berurutan" |
| 17 | Gambar portrait sangat tinggi tetap memicu timer di layar 320×568 | Lulus | E2E `images.spec.ts` › "gambar portrait sangat tinggi tetap memicu timer di layar 320×568"; Web `images.test.ts`, `visibility.test.ts` |
| 18 | Setelah "Hapus akun sekarang", semua room milik akun itu kosong di server | Lulus | E2E `account-ops.spec.ts` › "hapus akun sekarang: semua room akun itu kosong di server…"; Relay `account.test.ts` › "hapus akun: baris D1 hilang, InboxDO dikosongkan…" |
| 19 | Mengirim ke akun yang sudah hangus ditolak dan tidak membuat storage InboxDO baru | Lulus | Relay `rooms.test.ts` › "kirim ke akun hangus ditolak dan tidak membuat storage di InboxDO tujuan", "touch langsung ke inbox akun hangus…", "kirim ke lawan yang sudah menghapus akunnya ditolak…" |
| 20 | Setelah username lawan hangus lalu didaftarkan orang lain, daftar tidak menampilkan dua "@rara" | Lulus | E2E `chat.spec.ts` › "lawan hangus lalu username didaftarkan orang lain → tidak ada dua percakapan yang sama"; `account-ops.spec.ts` (butir 11) |
| 21 | A dan B memulai chat bersamaan dengan timer berbeda: room sama, timer sama | Lulus | E2E `retract-ttl.spec.ts` › "A dan B memulai bersamaan…"; Relay `rooms.test.ts` › "mulai bersamaan dengan timer berbeda…" |
| 22 | Upload gambar yang diputus di tengah jalan terhapus otomatis setelah 10 menit | Lulus | Relay `rooms.test.ts` › "upload yang terputus dihapus otomatis setelah 10 menit" |
| 23 | Refresh membuka kembali room yang benar walau urutan daftar berubah | Lulus | E2E `chat.spec.ts` › "refresh membuka room yang benar walau urutan daftar berubah; timer tetap akurat" |
| 24 | Blokir menghapus percakapan dan pesan berikutnya dari akun itu tidak tampil | Lulus | E2E `account-ops.spec.ts` › "blokir…"; Web `chat-rooms.test.ts` › "room dari akun yang diblokir di-purge dan dilupakan…" |
| 25 | `expire_at` room selalu kelipatan 1 jam dan tidak pernah melewati waktu hangus akun mana pun | Lulus | Relay `rooms.test.ts` › "expire_at room = floor_jam(min(umur A, umur B)), kelipatan jam" (diuji mutasi) |
| 26 | Refresh tab tetap masuk dan kembali ke layar/room terakhir; timer lebur yang berjalan tetap akurat | Lulus | E2E `session.spec.ts` › "refresh tetap masuk…"; `chat.spec.ts` › butir 23 |
| 27 | Tidak ada aktivitas 10 menit (mock clock) → sesi terkunci, termasuk saat tab tersembunyi | Lulus | E2E `session.spec.ts` › "tidak aktif 10 menit → peringatan, lalu terkunci…"; Web `idle.test.ts` › "terkunci walau timer diperlambat (tab tersembunyi)…" |
| 28 | Refresh setelah tidak aktif 10 menit → harus login ulang | Lulus | E2E `session.spec.ts` › "refresh setelah tidak aktif 10 menit → harus login ulang"; Web `session.test.ts` |
| 29 | Menutup tab lalu membuka tab baru → harus login ulang | Lulus | E2E `session.spec.ts` › "refresh tetap masuk; tab baru harus login ulang" |
| 30 | Tab duplikat tidak berbagi `sessionKey`; tab lama menampilkan "Akun ini sedang dibuka di tab lain." | Lulus | E2E `session.spec.ts` › "tab duplikat tidak berbagi sessionKey; tab lama diberi tahu"; Web `session.test.ts` |
| 31 | Setelah terkunci/logout, IndexedDB `sessions` dan sessionStorage `bc.*` kosong | Lulus | E2E `session.spec.ts` › butir 27 dan "login: password salah → pesan umum; benar → Home" (logout) |
| 32 | Tidak ada request jaringan selain origin sendiri dan relay; tidak ada pelanggaran CSP | Lulus | E2E `e2e/helpers.ts` › `watch()` dipakai di smoke, sesi, chat, batalkan, gambar: memeriksa request & WebSocket keluar origin, respons ≥ 400 tak terduga, error konsol, event `securitypolicyviolation`, dan scroll horizontal |

## Di luar §15.2 yang juga diuji

- **Aturan PRD §12** ditegakkan lint (`tooling/check-lint-rules.js`, 22 kasus) dan CI; bundle produksi relay bebas kode test (`tooling/check-relay-bundle.js`); HTML build tanpa script/style inline (`tooling/check-inline.js`).
- **Kompatibilitas kripto** client (libsodium) ↔ relay (`@noble/hashes`, WebCrypto) lewat vektor independen (`packages/crypto/test/vectors*.json`).
- **Uji mutasi manual**: pemeriksaan keamanan utama di crypto, relay, dan web dihapus satu per satu untuk membuktikan test-nya gagal (lihat `docs/PROGRESS.md`).
