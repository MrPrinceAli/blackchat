# BlackChat — Product Requirements Document (PRD)

> Spesifikasi lengkap untuk membangun BlackChat dari nol, ditujukan untuk dieksekusi oleh Claude Code.
> Baca seluruh dokumen sebelum menulis kode. Bagian **12. Aturan wajib** bersifat mengikat.

---

## 1. Ringkasan produk

BlackChat adalah aplikasi web chat rahasia satu-lawan-satu dengan enkripsi end-to-end (E2EE). Pengguna cukup membuat akun dengan username dan password. Akun otomatis hangus 3 hari setelah dibuat, beserta seluruh pesannya. Setiap pesan (teks atau gambar) melebur beberapa detik (3, 5, 7, atau 10, disepakati kedua pihak) setelah dilihat oleh penerima.

Server hanya melihat data terenkripsi. Pesan yang belum dibaca disimpan sementara dalam bentuk ciphertext dan dihapus permanen begitu melebur, dibatalkan, atau akun hangus.

### 1.1 Tujuan

| Tujuan | Ukuran keberhasilan |
|---|---|
| Registrasi minimal | Hanya username + password, selesai < 20 detik |
| Server tidak bisa membaca isi | Server hanya pernah menerima ciphertext teks & gambar |
| Umur data terbatas | Semua data akun & pesan terhapus paling lambat saat akun hangus (72 jam) |
| Sekali lihat | Pesan terhapus dari server, DOM, dan memori setelah timer habis |
| Server tidak menyimpan grafik sosial | Tidak ada tabel di server yang menyatakan "A berbicara dengan B" dalam bentuk terbaca |
| Gratis dioperasikan | Berjalan di paket gratis GitHub, Vercel, Cloudflare |

### 1.2 Di luar cakupan

- Aplikasi iOS/Android native.
- Group chat, voice, video, file selain gambar.
- Pemulihan password (tidak ada email, password hilang = akun hilang).
- Perpanjangan umur akun.
- Moderasi, laporan, aspek hukum (ditangani terpisah).

---

## 2. Arsitektur

### 2.1 Gambaran umum

```
                         ┌───────────────────────────────┐
                         │ Vercel (static) — apps/web    │
                         └───────────────┬───────────────┘
                                         │ HTTPS
┌────────────┐  wss (1 koneksi)  ┌───────▼──────────────────────────────────────────────┐
│ Browser A  │──────────────────►│ Cloudflare Worker — apps/relay                       │
│ libsodium  │                   │                                                      │
│ kunci di   │                   │  D1 accounts ── username, public key, vault terenkr. │
│ memori     │                   │                                                      │
└────────────┘                   │  InboxDO (1 per akun)                                │
                                 │   - socket milik akun (terautentikasi Ed25519)       │
┌────────────┐  wss              │   - daftar room (roomId opak + header tersegel)      │
│ Browser B  │──────────────────►│                                                      │
└────────────┘                   │  RoomDO (1 per pasangan, nama = hash rahasia)        │
                                 │   - pesan & chunk gambar terenkripsi                 │
                                 │   - alarm: lebur & hangus                            │
                                 │                                                      │
                                 │  LimiterDO — rate limit (memori)                     │
                                 │  Cron (tiap 15 menit) — hapus akun hangus di D1      │
                                 └──────────────────────────────────────────────────────┘
```

Prinsip utama:

1. **Satu koneksi WebSocket per client**, ke InboxDO milik akunnya sendiri. Semua operasi room diteruskan InboxDO ke RoomDO lewat RPC.
2. **RoomDO tidak tahu siapa anggotanya.** Nama room diturunkan dari rahasia Diffie-Hellman kedua pihak, dan anggota dibuktikan dengan kunci simetris khusus room (lihat 4.6).
3. **Notifikasi antar akun dilakukan langsung InboxDO → InboxDO**, karena client pengirim yang memberi tahu userId tujuan. Hubungan ini tidak pernah disimpan.

### 2.2 Komponen

| Komponen | Teknologi | Tanggung jawab |
|---|---|---|
| `apps/web` | Vite + Svelte 5 + TypeScript (SPA) | UI, kriptografi, pemrosesan gambar, timer |
| `apps/relay` | Cloudflare Workers + Durable Objects (SQLite) + D1 + Cron Trigger | Akun, routing, penyimpanan ciphertext sementara, lebur & hangus |
| `packages/protocol` | TypeScript murni | Tipe, konstanta, validator, encoding |
| `packages/crypto` | TypeScript + `libsodium-wrappers-sumo` | Semua operasi kriptografi client |
| CI/CD | GitHub Actions | Lint, test, deploy relay, hash rilis |

### 2.3 Alasan teknologi

| Keputusan | Alasan |
|---|---|
| Vite + Svelte SPA | Output statis tanpa inline script → CSP ketat |
| CSS murni, tanpa UI kit | Dependensi minimal |
| `libsodium-wrappers-sumo` | Dibutuhkan untuk Argon2id |
| Argon2id dijalankan di browser, bukan di Worker | CPU Worker gratis sangat terbatas; server cukup membandingkan hash |
| Gambar disimpan di storage SQLite RoomDO (dipecah per chunk) | Tidak butuh R2. Paket gratis: 5 GB total storage DO per akun Cloudflare, 1 GB per DO |
| Cron Trigger + alarm DO | Penghapusan berjalan otomatis walau tidak ada pengguna online |

---

## 3. Struktur repository (monorepo pnpm)

```
blackchat/
├─ apps/
│  ├─ web/
│  │  ├─ public/fonts/
│  │  ├─ src/
│  │  │  ├─ main.ts
│  │  │  ├─ App.svelte
│  │  │  ├─ lib/
│  │  │  │  ├─ strings.ts           # semua teks UI (Bahasa Indonesia)
│  │  │  │  ├─ account.ts           # register, login, logout, hapus akun, countdown umur akun
│  │  │  │  ├─ session.ts           # state akun, penyimpanan sesi per tab, kunci otomatis 10 menit
│  │  │  │  ├─ ws.ts                # 1 koneksi ke InboxDO, reconnect, heartbeat
│  │  │  │  ├─ rooms.ts             # daftar room, buka/tutup room, sinkronisasi
│  │  │  │  ├─ messages.ts          # enkripsi/dekripsi, store pesan, timer lebur
│  │  │  │  ├─ images.ts            # resize, strip metadata, enkripsi, chunk, render canvas
│  │  │  │  ├─ visibility.ts        # IntersectionObserver + fokus tab → pemicu "dilihat"
│  │  │  │  ├─ contacts.ts          # kontak terenkripsi (disimpan di blob akun)
│  │  │  │  ├─ safety.ts            # safety number + QR
│  │  │  │  └─ guard.ts             # sensor saat blur, blok copy/print/drag
│  │  │  ├─ screens/
│  │  │  │  ├─ Welcome.svelte
│  │  │  │  ├─ Register.svelte
│  │  │  │  ├─ Login.svelte
│  │  │  │  ├─ Home.svelte          # daftar percakapan + cari username
│  │  │  │  ├─ Chat.svelte
│  │  │  │  ├─ Verify.svelte
│  │  │  │  ├─ Settings.svelte
│  │  │  │  └─ Expired.svelte
│  │  │  ├─ components/
│  │  │  │  ├─ SecretBubble.svelte  # teks
│  │  │  │  ├─ SecretImage.svelte   # gambar (canvas)
│  │  │  │  ├─ BurnFx.svelte        # efek lebur (canvas)
│  │  │  │  ├─ ContextMenu.svelte   # menu klik kanan / tekan lama
│  │  │  │  ├─ AccountClock.svelte  # sisa umur akun
│  │  │  │  ├─ TimerPicker.svelte
│  │  │  │  └─ Composer.svelte
│  │  │  └─ styles/{tokens.css, base.css}
│  │  ├─ index.html
│  │  ├─ vite.config.ts
│  │  └─ vercel.json
│  └─ relay/
│     ├─ src/
│     │  ├─ index.ts               # router HTTP + scheduled()
│     │  ├─ account.ts             # register, salt, login, update, delete
│     │  ├─ inbox.ts               # InboxDO
│     │  ├─ room.ts                # RoomDO
│     │  ├─ limiter.ts             # LimiterDO
│     │  └─ verify.ts              # verifikasi Ed25519 (WebCrypto)
│     ├─ migrations/0001_init.sql
│     ├─ test/
│     └─ wrangler.toml
├─ packages/
│  ├─ protocol/src/{types.ts, constants.ts, validate.ts, encoding.ts}
│  └─ crypto/src/{keys.ts, pwhash.ts, seal.ts, aead.ts, room.ts, ids.ts, pad.ts}
├─ e2e/
├─ .github/workflows/{ci.yml, deploy-relay.yml, release-hash.yml}
├─ .github/dependabot.yml
├─ README.md
└─ SECURITY.md
```

Semua dependensi di-pin versi persis.

---

## 4. Kriptografi

### 4.1 Primitif

| Kebutuhan | Primitif | libsodium |
|---|---|---|
| Tanda tangan identitas | Ed25519 | `crypto_sign_*` |
| Kunci enkripsi identitas | X25519 | `crypto_box_keypair` |
| Rahasia bersama pasangan | X25519 DH | `crypto_scalarmult` |
| Bungkus kunci konten | Sealed box | `crypto_box_seal`, `crypto_box_seal_open` |
| Enkripsi konten | XChaCha20-Poly1305 | `crypto_aead_xchacha20poly1305_ietf_*` |
| Hash, KDF, MAC | BLAKE2b | `crypto_generichash` (keyed) |
| Turunan password | Argon2id | `crypto_pwhash` (OPSLIMIT_MODERATE, MEMLIMIT_MODERATE) |
| Padding teks | ISO 7816-4 | `sodium_pad` blok 256 byte |
| Hapus memori | — | `sodium_memzero` |

Semua label domain separation (`"bc-...-v1"`) ada di `packages/protocol/constants.ts`.

### 4.2 Identitas akun

Dibuat di browser saat register:

```ts
type Identity = {
  edPk: Uint8Array; edSk: Uint8Array;   // Ed25519
  xPk: Uint8Array;  xSk: Uint8Array;    // X25519
  xPkSig: Uint8Array;                   // Ed25519(edSk, "bc-xpk-v1" || xPk)
  userId: string;                       // base32-crockford(BLAKE2b-160(edPk)), 32 karakter
};
```

### 4.3 Password → kunci

```
salt      = 16 byte acak (dibuat saat register, disimpan di server)
master    = Argon2id(password, salt, 64 byte)
authKey   = BLAKE2b-256(key=master, "bc-auth-v1")     → dikirim ke server saat login
vaultKey  = BLAKE2b-256(key=master, "bc-vault-v1")    → TIDAK PERNAH meninggalkan browser
```

- Server menyimpan `authHash = SHA-256(authKey)`.
- `vault = XChaCha20-Poly1305(vaultKey, {edSk, xSk})` disimpan di server, hanya diberikan setelah `authKey` benar.
- Password: minimal 10 karakter, tidak sama dengan username, tidak ada di daftar 1.000 password paling umum (daftar dibundel di client).
- Ganti password = buat salt baru, enkripsi ulang vault, kirim dengan tanda tangan Ed25519.

### 4.4 Safety number

`BLAKE2b-256(sort(edPkA, edPkB))` → 60 digit (12 grup × 5) + QR. Status terverifikasi disimpan di blob kontak terenkripsi (4.8).

### 4.5 Enkripsi pesan (mendukung penerima offline)

Setiap pesan:

1. Buat `contentKey` 32 byte acak.
2. Plaintext dalam (`Inner`, lihat 4.7) di-pad lalu dienkripsi: `body = AEAD(contentKey, nonce24, Inner, aad = "bc-msg-v1" || roomId || msgId)`.
3. Untuk gambar: data gambar terlebih dahulu di-padding dengan `sodium_pad` hingga kelipatan tepat 256 KB (262.144 byte), lalu dipecah menjadi chunk masing-masing tepat 256 KB, dan setiap chunk dienkripsi dengan `contentKey` yang sama, nonce sendiri, dan AAD `"bc-img-v1" || roomId || msgId || u32(index)`. Dengan begitu semua chunk berukuran identik dan ukuran asli gambar hanya diketahui dari field `bytes` di dalam `Inner` yang terenkripsi.
4. `contentKey` dibungkus dua kali:
   - `keyForPeer = crypto_box_seal(contentKey, peerXPk)`
   - `keyForSelf = crypto_box_seal(contentKey, myXPk)` (agar pengirim bisa melihat pesannya sendiri di perangkat lain atau setelah login ulang)
5. `contentKey` di-`memzero` setelah selesai.

Keaslian pengirim dijamin oleh tanda tangan Ed25519 di dalam `Inner`.

Catatan keamanan yang diterima: jika `xSk` seseorang bocor sebelum akun hangus, pesan yang **masih tersimpan** di server bisa dibuka. Pesan yang sudah melebur sudah dihapus dari server sehingga tidak bisa dipulihkan. Saat akun hangus, `xSk` ikut musnah sehingga sisa ciphertext di mana pun menjadi tidak berguna (crypto-shredding). Double Ratchet dicatat sebagai pengembangan lanjutan.

### 4.6 Room tanpa identitas anggota

```
shared      = X25519(myXSk, peerXPk)                    // sama di kedua sisi
roomId      = BLAKE2b-256(key=shared, "bc-room-id-v1")   // hex, jadi nama RoomDO
memberKey_X = BLAKE2b-256(key=shared, "bc-member-v1" || edPk_X)
memberTag_X = BLAKE2b-128(key=memberKey_X, "bc-tag-v1")
```

- Server tidak bisa menghitung `roomId` dari daftar public key karena butuh `shared`.
- Saat room pertama dibuat, pengirim pertama mendaftarkan `{memberTag, memberKey}` untuk **kedua** anggota (ia bisa menghitung keduanya). RoomDO menyimpan pasangan ini, bukan userId.
- Setiap operasi room disertai bukti: `proof = BLAKE2b-256(key=memberKey, "bc-proof-v1" || opNonce || opHash)`; RoomDO memverifikasi dan tahu operasi datang dari anggota mana (berdasarkan `memberTag`), tanpa tahu akunnya.
- `opNonce` = 16 byte acak, RoomDO menolak nonce yang pernah dipakai dalam 10 menit terakhir (anti-replay).
- `shared` dan `memberKey` disimpan hanya di memori client.

### 4.7 Format `Inner`

```ts
type Inner = {
  v: 1;
  kind: "text" | "image";
  msgId: string;            // 16 byte acak base64url
  roomId: string;
  fromEdPk: string;
  ttl: 3 | 5 | 7 | 10;
  ts: number;
  text?: string;            // maks 2000 karakter (caption untuk gambar maks 300)
  image?: { w: number; h: number; mime: "image/webp" | "image/jpeg"; chunks: number; bytes: number; hash: string };
  sig: string;              // Ed25519 atas canonical JSON semua field di atas
};
```

Penerima menolak pesan jika `sig` tidak valid, `fromEdPk` bukan milik lawan bicara, `roomId`/`msgId` tidak cocok dengan record, atau `hash` gambar tidak cocok.

### 4.8 Blob kontak

`contacts = AEAD(vaultKey, sodium_pad(JSON([{ userId, edPk, username, verified, blocked }]), 4096))`, yaitu di-padding ke kelipatan 4 KB sebelum dienkripsi agar ukurannya tidak mencerminkan jumlah kontak, disimpan di server lewat `PUT /v1/account/contacts` (bertanda tangan). Digunakan untuk mendeteksi perubahan kunci.

---

## 5. Akun

### 5.1 Skema D1

```sql
CREATE TABLE accounts (
  username    TEXT PRIMARY KEY,      -- ^[a-z0-9_]{3,20}$
  user_id     TEXT NOT NULL UNIQUE,
  ed_pk       TEXT NOT NULL,
  x_pk        TEXT NOT NULL,
  x_pk_sig    TEXT NOT NULL,
  salt        TEXT NOT NULL,
  auth_hash   TEXT NOT NULL,
  vault       TEXT NOT NULL,         -- ciphertext
  contacts    TEXT,                  -- ciphertext
  seq         INTEGER NOT NULL,      -- anti-replay untuk update bertanda tangan
  expires_at  INTEGER NOT NULL       -- epoch ms = waktu register + 72 jam
) STRICT;
CREATE INDEX accounts_expires ON accounts(expires_at);
```

Tidak ada kolom IP, user agent, atau waktu login. `expires_at` adalah satu-satunya informasi waktu.

### 5.2 Endpoint akun

| Metode | Path | Body / respons |
|---|---|---|
| `POST` | `/v1/account/register` | `{username, salt, authKey, edPk, xPk, xPkSig, vault, sig}` → `{userId, expiresAt}` |
| `GET` | `/v1/account/salt?u=` | `{salt}`. Jika username tidak ada, kembalikan salt palsu deterministik `BLAKE2b(SALT_SECRET, username)` agar tidak bisa dipakai menebak username |
| `POST` | `/v1/account/login` | `{username, authKey}` → `{userId, edPk, xPk, xPkSig, vault, contacts, expiresAt, seq}`. Gagal → pesan umum "Username atau password salah" |
| `GET` | `/v1/account/lookup/:username` | `{userId, edPk, xPk, xPkSig, expiresAt}` (untuk mulai chat). `expiresAt` dibulatkan **ke bawah ke jam penuh** agar waktu register tidak bisa diketahui persis. Perhitungan `expire_at` room di server tetap memakai nilai asli dari D1 |
| `PUT` | `/v1/account/contacts` | Bertanda tangan, `seq` naik |
| `PUT` | `/v1/account/password` | `{salt, authKey, vault, seq, sig}` |
| `DELETE` | `/v1/account` | Bertanda tangan → hapus sekarang juga. Sebelum memanggil ini, client wajib menjalankan `room.purge` di **setiap** room miliknya (lihat 6.2), lalu server menghapus baris D1 dan memanggil `InboxDO.destroy()` (`deleteAll()` + tutup socket) |

Semua request bertanda tangan: `sig = Ed25519(edSk, label || canonical(fields))`, dan `seq` harus lebih besar dari yang tersimpan. Perbandingan `authHash` memakai `crypto.subtle.timingSafeEqual` (Workers) atau perbandingan constant-time setara.

Semua respons: `Cache-Control: no-store`. CORS hanya untuk `ALLOWED_ORIGIN`.

### 5.3 Umur akun (3 hari)

| Mekanisme | Implementasi |
|---|---|
| Penegakan di setiap request | Semua handler & DO menolak akun dengan `expires_at <= now` seolah tidak ada |
| Pembersihan D1 | Cron Trigger setiap 15 menit: `DELETE FROM accounts WHERE expires_at <= ?` |
| InboxDO | Saat dibuat, pasang alarm di `expiresAt` → tutup socket, `ctx.storage.deleteAll()` |
| RoomDO | Setiap room punya `expire_at = floor_jam(min(expiresAt A, expiresAt B))`, dihitung server dari nilai asli D1 saat `init`. Alarm menghapus **seluruh** room (`deleteAll()`) pada waktu itu. Dibulatkan ke bawah ke jam penuh agar tidak bisa dicocokkan dengan `expires_at` di D1, dan agar pesan tidak pernah hidup lebih lama dari akunnya |
| Client | Countdown di header; saat 0 → hapus semua state memori, tampilkan layar "Akun telah hangus" |

Username yang sudah hangus **boleh didaftarkan lagi** oleh siapa saja. Karena itu client wajib membandingkan `edPk` dengan blob kontak dan memberi peringatan jika username yang sama kini milik kunci berbeda.

### 5.4 Sesi di browser

Aturan perilaku:

| Kejadian | Hasil |
|---|---|
| Refresh tab | Tetap masuk, langsung kembali ke layar terakhir (Home atau room yang sedang dibuka) |
| Tidak ada aktivitas > 10 menit (tab terbuka maupun tersembunyi) | Sesi dikunci, semua data sesi dihapus, harus login ulang |
| Refresh setelah tidak aktif > 10 menit | Harus login ulang |
| Tab ditutup | Sesi hilang (tab baru = login ulang) |
| Logout | Semua data sesi dihapus |
| Akun hangus | Semua data sesi dihapus, tampil layar Expired |

**Aktivitas** = `pointerdown`, `keydown`, `wheel`, `touchstart`, `scroll` di dalam aplikasi. Fokus tab saja tanpa interaksi tidak dihitung. Membaca pesan masuk atau menerima event dari server juga tidak dihitung.

**Cara penyimpanan sesi (tahan refresh, terikat ke satu tab):**

1. Saat login berhasil, buat `sessionKey` = `crypto.subtle.generateKey({name:"AES-GCM", length:256}, extractable=false, ["encrypt","decrypt"])`. Karena non-extractable, JavaScript tidak bisa membaca nilai mentahnya.
2. Buat `tabId` = 16 byte acak (base64url).
3. Simpan `sessionKey` di IndexedDB store `sessions` dengan key `tabId`: `{ key: CryptoKey, lastActive: number }`.
4. Enkripsi state rahasia `{edSk, xSk, edPk, xPk, xPkSig, userId, username, vaultKey, seq, contacts}` dengan `sessionKey` (AES-GCM, IV 12 byte acak). Simpan di **`sessionStorage`** (hanya hidup di tab ini): `bc.tab = tabId`, `bc.sess = {iv, ct}`, `bc.view = {screen}`. Room yang terakhir dibuka (`lastRoomId`) disimpan **di dalam** `bc.sess` yang terenkripsi, bukan sebagai nomor urut daftar, karena urutan daftar bisa berubah.
5. Setiap ada aktivitas, perbarui `lastActive` di IndexedDB (throttle maks 1 kali per 15 detik) dan di memori.
6. Saat aplikasi dimuat:
   - Hapus semua entri IndexedDB `sessions` yang `lastActive` lebih tua dari 10 menit (membersihkan sisa tab yang sudah ditutup).
   - Jika `bc.tab` ada di `sessionStorage` dan entri IndexedDB-nya masih valid (`now - lastActive <= 10 menit`): dekripsi `bc.sess`, masuk ke WebSocket dengan challenge-response, sinkronkan ulang (`rooms` + `room.sync` untuk room yang terakhir dibuka), kembali ke `bc.view`.
   - Selain itu: hapus `bc.*` di `sessionStorage` dan tampilkan Login.
7. Penguncian karena tidak aktif dicek dengan **selisih waktu** (`Date.now() - lastActive`), bukan hanya `setTimeout`, karena timer di tab tersembunyi diperlambat browser. Pengecekan dilakukan setiap 15 detik dan saat `visibilitychange`/`focus`.
8. Saat sesi dikunci atau logout: hapus entri IndexedDB, hapus `bc.*` di `sessionStorage`, `memzero` semua kunci, tutup WebSocket, kosongkan store pesan.
9. Peringatan 60 detik sebelum terkunci: "Sesi akan dikunci dalam 60 detik karena tidak ada aktivitas." dengan tombol "Tetap masuk".

**Tab duplikat:** browser menyalin `sessionStorage` saat tab diduplikasi. Saat dimuat, tab baru membuat `tabId` dan `sessionKey` baru lalu mengenkripsi ulang sesi, sehingga kedua tab tidak berbagi kunci. Karena satu akun hanya boleh punya satu socket aktif, tab lama menampilkan "Akun ini sedang dibuka di tab lain." dengan tombol "Gunakan di sini". Deteksi duplikat memakai `BroadcastChannel("bc-tab")`.

**Yang tidak disimpan di browser:** isi pesan, gambar, `shared`/`memberKey` room, dan daftar room. Semuanya dimuat ulang dari server (dalam bentuk terenkripsi) dan dihitung ulang setelah refresh. Timer lebur yang sedang berjalan tetap akurat karena server mengirim `remainingMs` saat sync.

---

## 6. Relay

### 6.1 InboxDO (1 per akun, nama `inbox:<userId>`)

- WebSocket `GET /v1/ws/:userId` dengan challenge-response Ed25519 (`sig = Ed25519(edSk, "bc-auth-v1" || userId || nonce)`), cek akun belum hangus di D1.
- Satu socket aktif per akun (yang baru menutup yang lama, kode `4409`).
- Memakai Hibernatable WebSocket API.
- Storage SQLite:

```sql
CREATE TABLE rooms (
  room_id        TEXT PRIMARY KEY,
  sealed_header  BLOB NOT NULL,   -- crypto_box_seal ke xPk pemilik: {peerUserId, peerEdPk, peerXPk, peerXPkSig, peerUsername, peerExpiresAt (dibulatkan ke jam)}
  unread         INTEGER NOT NULL DEFAULT 0
);
```

Server tidak bisa membaca siapa lawan bicara di setiap room karena header tersegel. Tidak ada kolom waktu, sehingga server tidak menyimpan kapan sebuah percakapan terakhir aktif.

- RPC yang diterima dari InboxDO lain: `touch(roomId, sealedHeader?, unreadDelta)`, `event(roomId, payload)` (diteruskan ke socket jika online, dibuang jika offline).
- **Penjaga akun mati:** sebelum menulis apa pun ke storage (`touch`, koneksi socket), InboxDO memastikan akunnya masih ada dan belum hangus di D1. Jika tidak ada, tolak dan jalankan `deleteAll()`. Ini mencegah InboxDO milik akun hangus "hidup kembali" karena ada yang mengirim pesan ke sana. InboxDO pengirim juga menolak `room.send` jika akun tujuan sudah tidak ada.
- **Angka belum dibuka hanya petunjuk:** `unread` bisa meleset (misal pesan dibatalkan sebelum dibuka, atau room hangus). Setiap kali client menyinkronkan sebuah room, ia mengirim `rooms.setUnread(roomId, n)` dengan jumlah sebenarnya.
- `rooms.forget(roomId)`: pemilik menghapus satu entri room dari daftarnya.
- Kuota upload per akun: InboxDO menyimpan penghitung `uploaded_bytes`; total chunk yang boleh diunggah satu akun selama umurnya maksimal **150 MB**. Melebihi → tolak dengan `quota_exceeded`.

### 6.2 RoomDO (1 per pasangan, nama `room:<roomId>`)

Storage SQLite:

```sql
CREATE TABLE members (
  member_tag  TEXT PRIMARY KEY,
  member_key  BLOB NOT NULL
);
CREATE TABLE settings (
  k TEXT PRIMARY KEY, v TEXT NOT NULL   -- ttl aktif, usulan ttl (tag pengusul + nilai), expire_at
);
CREATE TABLE messages (
  msg_id          TEXT PRIMARY KEY,
  from_tag        TEXT NOT NULL,
  ttl             INTEGER NOT NULL,
  body            BLOB NOT NULL,
  key_for_peer    BLOB NOT NULL,
  key_for_self    BLOB NOT NULL,
  chunks          INTEGER NOT NULL DEFAULT 0,
  uploaded        INTEGER NOT NULL DEFAULT 1,  -- 0 selama gambar belum lengkap
  seq             INTEGER NOT NULL,            -- urutan dalam room
  opened_at       INTEGER,
  burn_at         INTEGER,
  upload_deadline INTEGER          -- now + 10 menit selama uploaded=0, NULL setelah lengkap
);
CREATE TABLE chunks (
  msg_id  TEXT NOT NULL,
  idx     INTEGER NOT NULL,
  data    BLOB NOT NULL,
  PRIMARY KEY (msg_id, idx)
);
CREATE TABLE used_nonces (nonce TEXT PRIMARY KEY, at INTEGER NOT NULL);
```

Tidak ada `created_at` pesan selain `seq`. Tidak ada userId.

Operasi RPC (dipanggil oleh InboxDO pemanggil, semuanya disertai `memberTag`, `opNonce`, `proof`):

| Operasi | Efek |
|---|---|
| `init(members[2], ttl, expireAt)` | Jika room kosong: simpan dua member, ttl awal, dan `expire_at`. Jika room sudah ada dengan member yang sama (kedua pihak memulai chat di saat bersamaan): dianggap sukses dan mengembalikan ttl yang berlaku, sehingga client bisa memberi tahu pengguna. Jika member berbeda: tolak |
| `send(record)` | Simpan pesan. Jika `chunks = 0` langsung `uploaded=1`; jika `chunks > 0` maka `uploaded=0` sampai semua chunk masuk. Server tidak menyimpan label jenis pesan (teks/gambar); jenisnya hanya ada di dalam `Inner` terenkripsi |
| `putChunk(msgId, idx, data)` | Hanya oleh pengirim pesan itu; maks 300 KB per chunk |
| `sync(sinceSeq)` | Kembalikan semua pesan yang `uploaded=1`, tanpa chunk. Pesan yang sudah dibuka menyertakan `remainingMs` agar pengirim yang tadinya offline tetap mendapat hitung mundur yang benar |
| `getChunk(msgId, idx)` | Hanya untuk pesan yang belum melebur |
| `opened(msgIds[])` | Hanya penerima (bukan pengirim). Set `opened_at`, `burn_at = now + ttl*1000 + 300`, jika belum diset. Kembalikan `remainingMs` |
| `retract(msgId)` | Hanya pengirim. Hapus pesan + chunk |
| `purge()` | Anggota mana pun. Hapus semua pesan dan chunk di room (dipakai saat hapus akun dan blokir) |
| `proposeTtl(ttl)` / `answerTtl(accept)` | Usulan dari satu anggota, jawaban hanya dari anggota lain |

Alarm RoomDO selalu disetel ke nilai paling awal dari: `burn_at` terdekat, `upload_deadline` terdekat, dan `expire_at` room. Saat alarm berbunyi:

1. Jika `now >= expire_at`: `deleteAll()` dan selesai.
2. Hapus pesan & chunk yang `burn_at` sudah lewat.
3. Hapus pesan & chunk yang `uploaded=0` dan `upload_deadline` sudah lewat (upload gambar yang terputus).
4. Hapus `used_nonces` yang lebih tua dari 10 menit.
5. Setel alarm berikutnya.

`used_nonces` juga dibersihkan setiap kali ada operasi baru, agar tabel tidak tumbuh tanpa batas.

Batas per room: maksimal 200 pesan tertunda, 30 MB total chunk. Melebihi → tolak dengan error `room_full`. Ditambah kuota 150 MB per akun di InboxDO (6.1), agar storage gratis 5 GB tidak bisa dihabiskan oleh segelintir akun.

### 6.3 Alur notifikasi

Karena RoomDO tidak tahu akun, notifikasi dikirim oleh InboxDO yang sedang bertindak:

```
A kirim pesan:
  Client A ─ws─► InboxDO(A) ─rpc─► RoomDO.send()
                  InboxDO(A) ─rpc─► InboxDO(B).touch(roomId, sealedHeaderForB, +1)
                  InboxDO(A) ─rpc─► InboxDO(B).event(roomId, {t:"new", seq})

B melihat pesan:
  Client B ─ws─► InboxDO(B) ─rpc─► RoomDO.opened(ids)  → remainingMs
                  InboxDO(B) ─rpc─► InboxDO(A).event(roomId, {t:"opened", id, remainingMs})

Timer habis:
  RoomDO alarm menghapus data.
  Kedua client juga menghapus secara lokal berdasarkan timer masing-masing.
  Client yang offline akan melihat pesan sudah hilang saat sync berikutnya.
```

`peerUserId` yang dibutuhkan untuk notifikasi diberikan oleh client (didapat dari header tersegel atau lookup) dan tidak disimpan oleh server.

### 6.4 LimiterDO

Kunci = `BLAKE2b(IP || salt)` dengan salt acak di memori. Tidak ada storage. LimiterDO dipecah menjadi **16 instance** (`limiter:0` sampai `limiter:f`, berdasarkan karakter hex pertama kunci) agar tidak semua request antre di satu titik.

| Aksi | Batas |
|---|---|
| Register | 3 per jam per IP |
| Login | 10 per 10 menit per IP; 5 gagal berturut-turut per username → jeda 30 dtk, berlipat ganda |
| Lookup username | 30 per menit |
| Kirim pesan | 30 per menit per akun |
| Upload chunk | 60 per menit per akun |

### 6.5 Frame WebSocket client ↔ InboxDO

```ts
// client → server
{ t: "ping" }
{ t: "rooms" }                                         // ambil daftar room
{ t: "rooms.setUnread", roomId, n }
{ t: "rooms.forget",    roomId }
{ t: "room.purge",  roomId, proof... }
{ t: "room.init",   roomId, peerUserId, members, ttl, sealedHeaderForPeer, sealedHeaderForSelf, proof... }
{ t: "room.sync",   roomId, sinceSeq, proof... }
{ t: "room.send",   roomId, peerUserId, record, proof... }
{ t: "room.chunk",  roomId, msgId, idx, data, proof... }  // frame biner, lihat 13.2
{ t: "room.getChunk", roomId, msgId, idx, proof... }
{ t: "room.opened", roomId, peerUserId, msgIds, proof... }
{ t: "room.retract",roomId, peerUserId, msgId, proof... }
{ t: "room.ttl",    roomId, peerUserId, action: "propose" | "accept" | "reject", ttl?, proof... }

// server → client
{ t: "pong" }
{ t: "event", roomId, payload: { t: "new" | "opened" | "retracted" | "ttl_proposed" | "ttl_changed" | "ttl_rejected", ... } }
{ t: "result", reqId, ok: boolean, data?, error? }
{ t: "expiring", inMs }                                // peringatan umur akun
```

Setiap request client membawa `reqId` untuk mencocokkan `result`.

---

## 7. Siklus hidup pesan

### 7.1 Status

| Status | Pengirim melihat | Penerima melihat |
|---|---|---|
| `sending` | Bubble dengan indikator kirim (gambar: progres upload) | — |
| `delivered` | Isi pesan + "Belum dibuka" | Isi tampil saat terlihat di layar (jika terdepan di antrean) |
| `queued` | Isi pesan + "Belum dibuka" | Balok tersensor + "Menunggu giliran" |
| `opened` | Isi + garis hitung mundur | Isi + garis hitung mundur |
| `burning` | Efek lebur 600 ms | Efek lebur 600 ms |
| `burned` | "Dilebur", hilang setelah 3 dtk | "Dilebur", hilang setelah 3 dtk |
| `retracted` | Hilang langsung | "Pesan dibatalkan", hilang setelah 3 dtk |

### 7.2 Kapan timer mulai

Timer pesan dari A mulai ketika **B melihat pesan itu**, didefinisikan sebagai: ruang obrolan terbuka, tab sedang fokus dan terlihat, dan minimal 50% bubble berada di viewport (IntersectionObserver). Untuk gambar, setelah gambar selesai didekripsi dan tergambar. Tinggi tampilan gambar dibatasi maksimal **60% tinggi layar** (lebar menyesuaikan rasio) agar syarat 50% selalu bisa terpenuhi di layar sekecil apa pun.

**Lebur berurutan.** Pesan masuk yang belum dibuka membentuk antrean berdasarkan `seq`:

- Hanya pesan **terdepan** di antrean yang isinya ditampilkan. Pesan di belakangnya tampil sebagai balok tersensor bertuliskan "Menunggu giliran", supaya tidak bisa dibaca tanpa timer.
- Timer pesan terdepan mulai saat terlihat (aturan di atas). Begitu pesan itu selesai melebur (termasuk animasi 600 ms), pesan berikutnya dibuka dan timernya mulai saat terlihat.
- Pesan baru yang masuk ketika antrean masih berjalan langsung masuk ke ujung antrean.
- Antrean hanya berlaku untuk pesan masuk. Pesan milik sendiri selalu tampil.
- Klien hanya mengirim `room.opened` untuk satu pesan terdepan pada satu waktu.

Begitu dimulai, timer **tidak bisa dihentikan**: walau B pindah tab atau menutup room, server tetap meleburkan di `burn_at`. Saat tab kehilangan fokus, tampilan disensor (lihat 9) tetapi waktu tetap berjalan.

Melihat pesan milik sendiri tidak memicu timer.

### 7.3 Kesepakatan timer

- Pengirim pertama memilih timer awal saat memulai percakapan.
- Salah satu pihak bisa mengusulkan timer baru; berlaku setelah pihak lain menekan Setuju.
- Setiap pesan membawa nilai `ttl` saat dikirim. Penerima memakai `min(ttl di Inner, ttl di record server)`.

### 7.4 Batalkan pesan

- Desktop: klik kanan bubble milik sendiri → menu "Batalkan pesan".
- Sentuh: tekan lama 500 ms → menu yang sama.
- Tersedia selama pesan belum melebur, termasuk saat masih upload (upload dihentikan).
- Jika pesan sudah dibuka, menu menampilkan keterangan: "Sudah dilihat. Pesan tetap dihapus dari kedua sisi."
- Menu bawaan browser dinonaktifkan di area chat. Di bubble milik lawan, klik kanan tidak memunculkan apa pun.
- Pembatalan menghapus record dan chunk di server, lalu InboxDO pengirim memberi tahu InboxDO lawan (`retracted`).

### 7.5 Gambar

| Tahap | Aturan |
|---|---|
| Input | Tombol lampiran, tempel (paste), atau drag & drop. Format masuk: JPEG, PNG, WebP, HEIC jika browser mampu decode. Maks 15 MB sebelum diproses |
| Proses | `createImageBitmap` → gambar ulang ke canvas → sisi terpanjang maks 1600 px → ekspor WebP kualitas 0.8 (fallback JPEG 0.85). Proses ini **menghapus seluruh metadata EXIF termasuk lokasi GPS**. Hasil maks 1.5 MB, jika lebih turunkan kualitas bertahap |
| Kirim | Padding + enkripsi (4.5), kirim record lalu chunk yang masing-masing tepat 256 KB. Progres upload tampil di bubble pengirim |
| Tampil | Unduh semua chunk → dekripsi → cek hash → `createImageBitmap` → gambar ke `<canvas>` (bukan `<img>`), agar tidak bisa di-drag atau disimpan lewat menu |
| Lebur | Efek lebur pada canvas, lalu `clearRect`, `bitmap.close()`, `memzero` buffer |
| Caption | Opsional, maks 300 karakter, melebur bersama gambar |

### 7.6 Penghapusan di client

- Plaintext teks hanya di objek lokal pesan; saat lebur di-set `null` dan objek dibuang.
- Render teks dengan text node (`{text}`), tidak pernah `{@html}`.
- Semua `Uint8Array` (kunci, plaintext, piksel gambar) di-`memzero` setelah dipakai.
- Batasan diterima: string JavaScript tidak bisa dijamin hilang dari memori oleh garbage collector.

---

## 8. Sinkronisasi

- Saat login: ambil `rooms` → buka setiap `sealed_header` → tampilkan daftar percakapan (username lawan, jumlah belum dibaca). Urutan ditentukan di browser: percakapan dengan pesan belum dibuka di atas, sisanya alfabetis berdasarkan username. Selama sesi berjalan, percakapan yang baru menerima pesan dipindah ke paling atas (urutan ini hanya di memori).
- Saat membuka room: hitung `shared`, `roomId`, `memberKey` → `room.sync(0)` → dekripsi `keyForSelf` untuk pesan sendiri, `keyForPeer` untuk pesan lawan.
- Saat reconnect: `room.sync(lastSeq)` untuk room yang sedang terbuka, `rooms` untuk daftar.
- Pesan yang sudah tidak ada di hasil sync tetapi masih ada di client → langsung dihancurkan (lebur sudah terjadi di server).
- **Lawan yang sudah hangus atau dihapus:** room yang `peerExpiresAt` di header tersegelnya sudah lewat langsung disembunyikan dan dihapus dari daftar (`rooms.forget`). Saat membuka room, client juga melakukan lookup username lawan; jika tidak ditemukan atau `edPk`-nya berbeda, room lama di-`forget` dan tampil "Akun @rara sudah tidak ada." Dengan begitu tidak pernah ada dua percakapan "@rara" sekaligus.
- **Blokir:** dari menu di header chat, "Blokir @rara". Status blokir disimpan di blob kontak terenkripsi (field `blocked`), sehingga server tidak tahu siapa memblokir siapa. Saat memblokir, client menjalankan `room.purge` lalu `rooms.forget`. Jika room dari akun yang diblokir muncul lagi di daftar, client otomatis melakukan hal yang sama tanpa menampilkan isinya.

---

## 9. Perlindungan tampilan

| Ancaman | Implementasi |
|---|---|
| Pindah jendela / screenshot tool | `window.blur` atau tab tersembunyi → overlay hitam penuh, semua isi disensor |
| Salin teks | `user-select: none`, blok `copy`, `cut`, `dragstart` |
| Simpan gambar | Render di canvas, menu konteks bawaan dimatikan |
| Print | `@media print { body { display: none !important } }` |
| Foto layar dengan kamera lain | Watermark samar 6 karakter terakhir userId penerima di atas teks dan gambar |
| Ekstensi browser | Saran mode incognito di layar Welcome |

---

## 10. UI/UX

### 10.1 Arah visual

Hitam putih murni, minimalis, terasa seperti arsip rahasia digital. Ciri khas yang paling diingat: **efek lebur**, yaitu pesan pecah menjadi butiran piksel yang runtuh dan memudar saat waktunya habis, dan **jam umur akun** yang selalu terlihat sebagai pengingat bahwa semuanya sementara. Elemen lain tenang dan disiplin.

### 10.2 Token

```css
:root {
  --ink: #000000;
  --paper: #FFFFFF;
  --graphite: #5C5C5C;
  --ash: #A3A3A3;
  --hairline: #E5E5E5;   /* garis tema terang */
  --smoke: #262626;      /* garis tema gelap */

  --font-ui: "Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-code: "Martian Mono", ui-monospace, Menlo, monospace;

  --step--1: 0.8125rem; --step-0: 1rem; --step-1: 1.25rem; --step-2: 1.75rem; --step-3: 2.75rem;
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-6: 24px; --space-8: 32px; --space-12: 48px;
  --radius-bubble: 2px;
  --radius-control: 999px;
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
}
```

- Tema default gelap (latar `--ink`), tema terang dibalik total; ikuti `prefers-color-scheme`, toggle manual di Settings (disimpan di `localStorage`, satu-satunya data di sana).
- Tanpa warna lain, tanpa bayangan, tanpa gradien. Status dibedakan dengan bentuk dan teks.
- Font self-hosted (woff2, OFL) di `public/fonts/`. Dilarang CDN.
- `--font-code` hanya untuk username di chat header, angka countdown, safety number, dan jam umur akun.
- Sentence case di semua teks. Tanpa label huruf kapital semua.
- Pesan masuk rata kiri dengan garis 1px; pesan sendiri rata kanan dengan blok solid terbalik (putih di tema gelap).

### 10.3 Layar

**Welcome**
```
┌──────────────────────────────────────┐
│ blackchat                            │
│                                      │
│ Pesan yang melebur setelah dibaca.   │
│ Akun yang hangus dalam 3 hari.       │
│                                      │
│ ( Buat akun )                        │
│ ( Masuk )                            │
│                                      │
│ Untuk privasi terbaik, buka di mode  │
│ incognito tanpa ekstensi.            │
└──────────────────────────────────────┘
```

**Register**: input username (validasi langsung: "Tersedia" / "Sudah dipakai"), password, ulangi password. Di bawah tombol: "Tidak ada pemulihan password. Akun dan semua pesan hangus otomatis 3 hari setelah dibuat." Tombol "Buat akun". Saat Argon2id berjalan tampilkan "Mengamankan akun..." (proses 1–3 detik wajar).

**Login**: username, password, tombol "Masuk". Error: "Username atau password salah."

**Home**
```
┌──────────────────────────────────────┐
│ blackchat           2h 14j 03m   ⚙   │  ← AccountClock (font code)
│                                      │
│ ( Cari username...           ) [+]   │
│                                      │
│ @rara                         ■ 2    │  ← ■ = jumlah belum dibuka
│ @dimas                               │
│                                      │
└──────────────────────────────────────┘
```
Kosong: "Belum ada percakapan. Cari username untuk mulai."
Mulai percakapan baru: pilih timer (3 / 5 / 7 / 10 detik), lalu masuk Chat.

**AccountClock**: format `2h 14j 03m`; di bawah 1 jam `59m 12d`. Peringatan inline di 24 jam, 1 jam, dan 5 menit terakhir: "Akun hangus dalam 1 jam. Semua pesan ikut terhapus."

**Chat**
```
┌──────────────────────────────────────┐
│ ←  @rara           ⧗ 5 dtk    [✓]    │
│──────────────────────────────────────│
│ ┌──────────────────────┐             │
│ │ jam 8 di tempat biasa │             │  ← pesan masuk, garis 1px
│ └──────────────────────┘             │
│ ▔▔▔▔▔▔▔▔▔▔▔▔▔▔  3                    │  ← garis menyusut + sisa detik
│                                      │
│              ████████████████████    │  ← pesan sendiri, blok terbalik
│              Belum dibuka            │
│                                      │
│──────────────────────────────────────│
│ [⊕] ( Tulis pesan...          ) [↑]  │
└──────────────────────────────────────┘
```
Ketuk `⧗ 5 dtk` untuk mengusulkan timer baru. `[✓]` membuka Verify. Menu `⋯` di header berisi "Blokir @rara".

**Verify**: 60 digit + QR, tombol "Tandai terverifikasi".

**Settings**: Tema, Ganti password, Keluar, Hapus akun sekarang (konfirmasi mengetik username). Saat menghapus, tampilkan progres "Menghapus percakapan..." selama `room.purge` dijalankan di setiap room.

**Expired**: "Akun ini telah hangus. Semua pesan sudah dihapus." Tombol "Buat akun baru".

### 10.4 Efek lebur (`BurnFx`)

600 ms pada canvas: area bubble diambil sebagai grid piksel 4 px; setiap piksel memudar dengan delay acak sambil jatuh 8–24 px, lalu area menyusut tingginya ke 0. `prefers-reduced-motion`: fade 200 ms. Ini satu-satunya animasi mencolok di aplikasi.

### 10.5 Menu konteks

Panel kecil 1px border, satu item "Batalkan pesan". Bisa dibuka keyboard (`Shift+F10` / tombol Menu saat bubble fokus), ditutup dengan `Esc` atau klik di luar.

### 10.6 Copywriting

| Situasi | Teks |
|---|---|
| Username tidak ditemukan | "Username tidak ditemukan. Mungkin sudah hangus." |
| Kunci lawan berubah | "@rara sekarang memakai kunci berbeda. Ini bisa jadi akun baru dengan username yang sama." |
| Usulan timer | "@rara ingin mengubah timer ke 3 detik." ( Setuju ) ( Tolak ) |
| Room penuh | "Terlalu banyak pesan belum dibuka di percakapan ini." |
| Gambar terlalu besar | "Gambar maksimal 15 MB." |
| Koneksi putus | "Menyambung ulang..." |
| Pesan antre | "Menunggu giliran" |
| Lawan sudah tidak ada | "Akun @rara sudah tidak ada." |
| Timer berbeda karena mulai bersamaan | "Kalian memulai bersamaan. Timer yang berlaku 5 detik." |
| Blokir | "Blokir @rara? Semua pesan di percakapan ini dihapus dan pesan berikutnya dari akun ini tidak akan ditampilkan." |
| Kuota upload habis | "Batas kirim gambar untuk akun ini sudah tercapai." |

### 10.7 Kualitas minimum

Responsif dari 320 px, lebar konten maks 640 px, kontras WCAG AA, fokus keyboard terlihat, `prefers-reduced-motion` dihormati, bundle JS tanpa libsodium < 100 KB gzip.

---

## 11. Deployment & keamanan platform

### 11.1 `apps/web/vercel.json`

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Content-Security-Policy", "value": "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self' wss://RELAY_HOST https://RELAY_HOST; worker-src 'self' blob:; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests" },
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "Referrer-Policy", "value": "no-referrer" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Resource-Policy", "value": "same-origin" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Cache-Control", "value": "no-store" }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    }
  ],
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

`RELAY_HOST` diganti saat build dari `VITE_RELAY_URL`. CI memastikan `dist/index.html` tanpa inline script/style.

### 11.2 `apps/relay/wrangler.toml`

```toml
name = "blackchat-relay"
main = "src/index.ts"
compatibility_date = "2026-10-01"

[observability]
enabled = false

[triggers]
crons = ["*/15 * * * *"]

[[durable_objects.bindings]]
name = "INBOX"
class_name = "InboxDO"

[[durable_objects.bindings]]
name = "ROOM"
class_name = "RoomDO"

[[durable_objects.bindings]]
name = "LIMITER"
class_name = "LimiterDO"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["InboxDO", "RoomDO", "LimiterDO"]

[[d1_databases]]
binding = "DB"
database_name = "blackchat"
database_id = "ISI_SETELAH_wrangler_d1_create"

[vars]
ALLOWED_ORIGIN = "https://blackchat.vercel.app"
```

Secret: `SALT_SECRET` (32 byte acak, via `wrangler secret put`).

### 11.3 GitHub Actions

| Workflow | Pemicu | Isi |
|---|---|---|
| `ci.yml` | PR & push | install `--frozen-lockfile`, lint, typecheck, unit, test Worker, e2e, cek inline script, `pnpm audit --audit-level high` |
| `deploy-relay.yml` | Push `main` (relay/protocol berubah) | Migrasi D1 + `wrangler deploy` |
| `release-hash.yml` | Tag `v*` | SHA-384 seluruh file `dist/` → `hashes.txt` di GitHub Release |

Pin semua action ke commit SHA. Dependabot untuk npm & actions.

---

## 12. Aturan wajib untuk implementasi

1. Dilarang `console.*` di relay dan di kode produksi web (`no-console: error`).
2. Dilarang `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, `{@html}`.
3. Dilarang menyimpan IP, user agent, waktu login, atau pemetaan userId ↔ userId di storage mana pun.
4. RoomDO dilarang menyimpan userId, username, atau public key. Hanya `member_tag` dan `member_key`.
5. Dilarang menyimpan plaintext apa pun di server. Semua isi pesan, gambar, vault, kontak, dan header room adalah ciphertext.
6. Penyimpanan browser yang diizinkan hanya: preferensi tema di `localStorage`, sesi terenkripsi di `sessionStorage` (`bc.tab`, `bc.sess`, `bc.view`), dan `sessionKey` non-extractable di IndexedDB (5.4). Isi pesan dan gambar tidak boleh menyentuh storage browser mana pun.
7. Dilarang analytics, error tracking, font/script CDN, atau request jaringan selain ke origin sendiri dan relay.
8. Dilarang menaruh username, userId, atau roomId di URL.
9. Semua `Uint8Array` rahasia di-`memzero` setelah dipakai.
10. Semua input jaringan divalidasi di `packages/protocol/validate.ts` sebelum diproses (tipe, panjang, alfabet, ukuran). Input tidak valid ditolak.
11. Semua perbandingan rahasia constant-time.
12. Dilarang menulis algoritma kriptografi sendiri; hanya merangkai libsodium / WebCrypto sesuai bagian 4.
13. Setiap penghapusan di server (lebur, batal, hangus) menghapus record **dan** chunk dalam satu transaksi.
14. Semua dependensi di-pin; dependensi baru wajib dicatat alasannya di `README.md`.
15. Jangan menambahkan kolom atau field terbaca server yang tidak mutlak dibutuhkan untuk routing, penghapusan, atau rate limit. Jenis pesan, ukuran asli gambar, waktu aktivitas, dan jumlah kontak hanya boleh ada di dalam ciphertext.

---

## 13. Detail teknis tambahan

### 13.1 WebSocket

- Heartbeat 25 detik; gunakan `setWebSocketAutoResponse` agar InboxDO tidak bangun dari hibernasi.
- Reconnect: backoff 0.5 → 1 → 2 → 4 → maks 10 detik, dengan jitter.

### 13.2 Upload chunk

Frame biner: `[1 byte tipe=0x01][16 byte msgId][4 byte idx][2 byte panjang header JSON][header JSON proof][data chunk]`. Maks 300 KB per frame. Client menunggu `result` per chunk sebelum mengirim berikutnya (maks 2 chunk berjalan bersamaan).

### 13.3 Waktu

Server mengirim `remainingMs`, bukan timestamp absolut, untuk timer lebur dan umur akun, agar perbedaan jam perangkat tidak berpengaruh. Client menghitung mundur dengan `performance.now()`.

### 13.4 Variabel lingkungan

| Nama | Lokasi |
|---|---|
| `VITE_RELAY_URL` | Vercel / `.env` web |
| `ALLOWED_ORIGIN` | `wrangler.toml` |
| `SALT_SECRET` | Wrangler secret |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub Secrets |

---

## 14. Peta risiko → mitigasi

| # | Risiko | Status | Mitigasi |
|---|---|---|---|
| 1 | Akun GitHub/Vercel/Cloudflare diretas | Dikurangi | 11.3, 2FA, hash rilis |
| 2 | Supply chain npm | Dikurangi | Dependensi minimal, pin, audit |
| 3 | XSS lewat pesan | **Dicegah** | Aturan 2, CSP |
| 4 | MITM penukaran kunci | **Dicegah** (jika diverifikasi) | 4.4, deteksi perubahan kunci 4.8 |
| 5 | Username lama dipakai orang lain setelah hangus | Dikurangi | Peringatan kunci berbeda 5.3 |
| 6 | Brute force password online | **Dicegah** | Rate limit + jeda per username 6.4 |
| 7 | Brute force password jika database bocor | Dikurangi | Argon2id; hanya bisa satu per satu dan berat |
| 8 | Enumerasi username lewat login | **Dicegah** | Salt palsu, error umum |
| 9 | Orang asing membaca/mengubah room | **Dicegah** | 4.6 member proof |
| 10 | Replay operasi room | **Dicegah** | `opNonce` + `used_nonces` |
| 11 | Server mengetahui siapa bicara dengan siapa (data tersimpan) | **Dicegah** | 4.6 roomId rahasia, header tersegel, aturan 3 & 4 |
| 12 | Server melihat hubungan saat pesan diproses (sesaat) | Diterima | Tidak disimpan, observability mati |
| 13 | Kunci bocor sebelum hangus → pesan tersimpan terbaca | Dikurangi | Pesan dihapus saat lebur; Double Ratchet di masa depan |
| 14 | Metadata EXIF/GPS di gambar | **Dicegah** | Re-encode canvas 7.5 |
| 15 | Screenshot / foto layar | Dikurangi | 9 |
| 16 | Client dimodifikasi menyimpan pesan | Diterima | Batasan desain |
| 17 | Pesan sudah dilihat lalu dibatalkan | Diterima | Keterangan di menu 7.4 |
| 18 | Storage gratis penuh (gambar) | Dikurangi | Batas per room, kuota 150 MB per akun, pembersihan upload terputus, umur 3 hari, kompresi |
| 19 | Pesan tidak terhapus jika client offline | **Dicegah** | Alarm RoomDO server-side |
| 20 | Akun tidak terhapus tepat waktu | **Dicegah** | Penegakan per request + cron + alarm |
| 21 | Perbedaan jam perangkat | **Dicegah** | `remainingMs` 13.3 |
| 22 | Kuota gratis habis | Dikurangi | Hibernasi, rate limit |
| 23 | Plaintext tersisa di memori JS | Dikurangi | 7.6 |
| 24 | Password lupa | Diterima | Tidak ada pemulihan, dijelaskan saat register |
| 25 | Kunci sesi tersimpan di browser (agar tahan refresh) | Dikurangi | Terenkripsi dengan kunci non-extractable, terikat 1 tab, hangus setelah 10 menit tidak aktif. Penyerang dengan akses fisik ke profil browser dalam rentang itu masih berpotensi memulihkannya (diterima) |
| 26 | Sesi tertinggal di perangkat yang ditinggal | **Dicegah** | Kunci otomatis 10 menit 5.4 |
| 27 | Ukuran gambar terenkripsi membocorkan jenis isi | **Dicegah** | Padding 256 KB, semua chunk identik 4.5 |
| 28 | Ukuran blob kontak membocorkan jumlah kontak | **Dicegah** | Padding 4 KB 4.8 |
| 29 | Server mencatat waktu aktivitas percakapan | **Dicegah** | Tanpa `updated_at` di InboxDO 6.1 |
| 30 | Server tahu jenis pesan (teks/gambar) | Dikurangi | Tanpa kolom `kind`; server hanya tahu ada/tidaknya chunk 6.2 |
| 31 | Waktu register terlihat lewat lookup | **Dicegah** | `expiresAt` dibulatkan ke jam 5.2 |
| 32 | Waktu hangus room dicocokkan dengan D1 untuk menebak anggota | **Dicegah** | `expire_at` room dibulatkan ke jam 5.3 |
| 33 | Hapus akun tidak menghapus pesan tertunda | **Dicegah** | `room.purge` sebelum hapus akun 5.2 |
| 34 | InboxDO akun hangus hidup kembali | **Dicegah** | Penjaga akun mati 6.1 |
| 35 | Dua percakapan dengan username sama | **Dicegah** | 8, `rooms.forget` |
| 36 | Pesan menumpuk melebur sebelum terbaca | **Dicegah** | Lebur berurutan 7.2 |
| 37 | Gambar tinggi tidak pernah memicu timer | **Dicegah** | Tinggi maks 60% layar 7.2 |

---

## 15. Testing & kriteria penerimaan

### 15.1 Test wajib

| Jenis | Alat | Cakupan |
|---|---|---|
| Unit crypto | Vitest | Turunan password, vault, sealed box, `roomId` sama di kedua sisi, member proof, tanda tangan Inner, enkripsi chunk |
| Unit protocol | Vitest | Validator menolak semua input cacat |
| Worker | `@cloudflare/vitest-pool-workers` | Register/login, salt palsu, lockout, akun hangus ditolak, cron menghapus, proof salah ditolak, nonce dipakai ulang ditolak, hanya penerima bisa `opened`, hanya pengirim bisa `retract`, alarm menghapus pesan & chunk, RoomDO tidak menyimpan userId |
| E2E | Playwright (2 context) | 15.2 |

### 15.2 Kriteria penerimaan

- [ ] Register hanya dengan username + password; jam umur akun tampil ~72 jam.
- [ ] A mengirim teks saat B offline; B login kemudian dan menerima pesan.
- [ ] Timer pesan A baru mulai saat pesan terlihat di layar B, dan pesan hilang dari DOM kedua pihak setelah 3/5/7/10 detik (± 500 ms).
- [ ] Berlaku sebaliknya untuk pesan B ke A.
- [ ] Jika B menutup tab setelah timer mulai, pesan tetap terhapus di server pada waktunya (cek via `room.sync`).
- [ ] Klik kanan pesan sendiri → "Batalkan pesan" menghapus pesan di kedua sisi dan di server.
- [ ] Klik kanan pesan lawan tidak memunculkan menu.
- [ ] Gambar terkirim, tampil di canvas, metadata EXIF hilang (uji dengan gambar ber-GPS), dan melebur sesuai timer.
- [ ] Usulan timer hanya berlaku setelah disetujui.
- [ ] Setelah waktu akun dimajukan melewati 72 jam (mock clock), login gagal, InboxDO kosong, pesan terkait terhapus.
- [ ] Username hangus bisa didaftarkan lagi; lawan bicara lama mendapat peringatan kunci berbeda.
- [ ] Pesan `<img src=x onerror=alert(1)>` tampil sebagai teks.
- [ ] Semua chunk gambar yang tersimpan di RoomDO berukuran identik, untuk gambar kecil maupun besar.
- [ ] Tabel `rooms` di InboxDO tidak punya kolom waktu; tabel `messages` di RoomDO tidak punya kolom jenis pesan.
- [ ] `expiresAt` dari lookup selalu kelipatan 1 jam.
- [ ] B menerima 5 pesan sekaligus: hanya pesan pertama yang terbaca, sisanya "Menunggu giliran", dan pesan melebur satu per satu berurutan.
- [ ] Gambar portrait sangat tinggi tetap memicu timer di layar 320×568.
- [ ] Setelah "Hapus akun sekarang", semua room milik akun itu kosong di server.
- [ ] Mengirim ke akun yang sudah hangus ditolak dan tidak membuat storage InboxDO baru.
- [ ] Setelah username lawan hangus lalu didaftarkan orang lain, daftar percakapan tidak menampilkan dua "@rara".
- [ ] A dan B memulai chat bersamaan dengan timer berbeda: keduanya masuk ke room yang sama dengan timer yang sama.
- [ ] Upload gambar yang diputus di tengah jalan terhapus otomatis setelah 10 menit.
- [ ] Refresh membuka kembali room yang benar walau urutan daftar berubah.
- [ ] Blokir menghapus percakapan dan pesan berikutnya dari akun itu tidak tampil.
- [ ] `expire_at` room selalu kelipatan 1 jam dan tidak pernah melewati waktu hangus akun mana pun.
- [ ] Refresh tab tetap masuk dan kembali ke layar/room terakhir; timer lebur yang sedang berjalan tetap akurat.
- [ ] Tidak ada aktivitas selama 10 menit (mock clock) → sesi terkunci dan harus login ulang, termasuk saat tab tersembunyi.
- [ ] Refresh setelah tidak aktif 10 menit → harus login ulang.
- [ ] Menutup tab lalu membuka tab baru → harus login ulang.
- [ ] Tab duplikat tidak berbagi `sessionKey`; tab lama menampilkan "Akun ini sedang dibuka di tab lain."
- [ ] Setelah terkunci/logout, IndexedDB `sessions` dan `sessionStorage` `bc.*` kosong.
- [ ] Tidak ada request jaringan selain origin sendiri dan relay; tidak ada pelanggaran CSP.

---

## 16. Urutan pengerjaan untuk Claude Code

1. Setup monorepo, TypeScript strict, ESLint (aturan bagian 12), Vitest.
2. `packages/protocol` + test.
3. `packages/crypto` + test lengkap.
4. `apps/relay`: akun & D1, LimiterDO, InboxDO, RoomDO (teks dulu), cron, test.
5. `apps/web`: token, font, Welcome → Register/Login → Home → Chat (teks), AccountClock, sesi tahan refresh + kunci 10 menit (5.4).
6. Timer berbasis visibilitas, efek lebur, guard.
7. Batalkan pesan + menu konteks.
8. Gambar: proses, enkripsi, chunk, canvas, lebur.
9. Kesepakatan timer, Verify, kontak & peringatan kunci, Settings, Expired.
10. Konfigurasi deploy, GitHub Actions, Dependabot.
11. E2E 15.2.
12. `README.md` dan `SECURITY.md` (model ancaman + batasan yang diterima: nomor 12, 16, 17, 24, 25).

### 16.1 Checklist manual pemilik proyek

- [ ] 2FA (passkey/security key) di GitHub, Vercel, Cloudflare.
- [ ] Branch protection `main`, wajib PR + CI hijau, signed commits.
- [ ] `wrangler d1 create blackchat`, isi `database_id`, jalankan migrasi.
- [ ] `wrangler secret put SALT_SECRET`.
- [ ] Hubungkan repo ke Vercel (Root Directory `apps/web`), isi `VITE_RELAY_URL`.
- [ ] Matikan Vercel Analytics & Speed Insights, aktifkan Deployment Protection.
- [ ] Isi `CLOUDFLARE_API_TOKEN` dan `CLOUDFLARE_ACCOUNT_ID` di GitHub Secrets.
