# BLACKCHAT — Build Waves untuk Claude Code (VS Code)

> **Pesan yang melebur setelah dibaca. Akun yang hangus dalam 3 hari.**

**Versi:** 1.0 · **Tanggal:** 4 Oktober 2026
**Sumber:** `BLACKCHAT_PRD.md` (spesifikasi, dirujuk sebagai **PRD §N**) + `docs/DECISIONS.md` (koreksi, dirujuk sebagai **D-xxx**).

File ini adalah rencana kerja untuk membangun BlackChat dari folder kosong sampai rilis. Spesifikasi teknisnya tidak diulang di sini; setiap prompt merujuk ke § PRD dan D-xxx yang relevan.

| Dokumen | Isi | Peran |
|---|---|---|
| `CLAUDE.md` | Konteks, Aturan Emas, protokol kerja | Dibaca otomatis Claude Code tiap sesi |
| `BLACKCHAT_PRD.md` | Spesifikasi lengkap | Referensi |
| `docs/DECISIONS.md` | Koreksi & keputusan (menang jika bertentangan dengan PRD) | Referensi + dicatat tiap gelombang |
| `docs/BLACKCHAT-WAVES.md` | 13 gelombang (W0–W12): prompt siap tempel + gerbang | Dieksekusi berurutan |
| `docs/PROGRESS.md` | Status tiap gelombang | Diperbarui di akhir gelombang |

---

## 0. Cara Pakai

1. Buka folder `blackchat` di VS Code. `CLAUDE.md` sudah ada di root.
2. Untuk setiap gelombang:
   - Mulai sesi bersih (`/clear`) supaya konteks gelombang sebelumnya tidak menumpuk.
   - Buat branch: `git checkout -b wN-nama-gelombang` (W0 membuat repo git-nya).
   - Aktifkan **plan mode** (Shift+Tab), cek rencana Claude, lalu setujui.
   - Tempel prompt gelombang tersebut apa adanya.
   - Claude push branch & membuka PR. Cek **Gerbang** lewat status GitHub Actions di PR, lalu merge.
3. **Jangan lompat gelombang.** Gelombang yang ditandai "bisa paralel" boleh dikerjakan di sesi/worktree terpisah karena tidak menyentuh file yang sama.
4. **Jangan pernah menempel secret ke chat** (`SALT_SECRET`, token Cloudflare). Isi langsung lewat `wrangler secret put` atau GitHub Secrets.

### Peta Gelombang

```text
W0 Fondasi monorepo
 ├──► W1 Protocol ──────────┬──► W3 Crypto room & pesan ──┐
 ├──► W2 Crypto inti ───────┤                             ▼
 │                          └──► W4 Relay akun & limiter ─► W5 Relay InboxDO & RoomDO ─┐
 └──► W6 Web fondasi & UI statis (bisa paralel dengan W1–W5) ──────────────────────────┤
                                                                                        ▼
                                                              W7 Web: akun, sesi & koneksi
                                                                                        ▼
                                                              W8 Chat teks end-to-end
                                                                                        ▼
                                                              W9 Batalkan pesan & timer
                                                                                        ▼
                                                              W10 Gambar
                                                                                        ▼
                                                              W11 Kontak, verifikasi, blokir & settings
                                                                                        ▼
                                                              W12 Rilis: deploy, E2E penuh, dokumen
```

| Gelombang | Nama | PRD §16 langkah | Bergantung pada | Bisa paralel dengan | Hasil yang bisa dicek |
|---|---|---|---|---|---|
| W0 | Fondasi monorepo | 1 | — | — | Repo, CI hijau, kerangka build |
| W1 | Protocol | 2 | W0 | W2, W6 | Validator menolak semua input cacat |
| W2 | Crypto inti | 3 | W0 | W1, W6 | Identitas, password → kunci, vault, safety number |
| W3 | Crypto room & pesan | 3 | W1, W2 | W4, W6 | `roomId` sama di dua sisi, pesan & chunk terenkripsi |
| W4 | Relay: akun & limiter | 4 | W1, W2 | W3, W6 | Register/login lewat HTTP, lockout, cron |
| W5 | Relay: InboxDO & RoomDO | 4 | W3, W4 | W6 | Dua client test bertukar pesan teks lewat WS |
| W6 | Web: fondasi & UI statis | 5 (sebagian), 6 (BurnFx, guard) | W0 | W1–W5 | Layar statis, CSP ketat, tanpa inline script |
| W7 | Web: akun, sesi & koneksi | 5 | W5, W6 | — | Register, login, refresh tetap masuk, kunci 10 menit |
| W8 | Chat teks end-to-end | 5, 6 | W7 | — | A → B offline → B menerima → lebur berurutan |
| W9 | Batalkan pesan & timer | 7, 9 (timer) | W8 | — | Menu batalkan, usulan timer, mulai bersamaan |
| W10 | Gambar | 8 | W9 | — | Gambar terkirim, EXIF hilang, chunk identik |
| W11 | Kontak, verifikasi, blokir & settings | 9 | W10 | — | Peringatan kunci, blokir, hapus akun |
| W12 | Rilis | 10, 11, 12 | semua | — | Seluruh PRD §15.2 tercentang, relay & web live |

W9–W11 sengaja berurutan: ketiganya menyentuh `room.ts`, `inbox.ts`, `messages.ts`, dan `Chat.svelte`. Gelombang paling berisiko adalah **W3, W5, dan W8**; jangan dipercepat.

### 0.1 Lingkungan (berlaku untuk semua gelombang, D-005)

| Kebutuhan | Di mana | Catatan |
|---|---|---|
| Kode & CI | GitHub (repo `blackchat`) + GitHub Actions | Lint, typecheck, unit, test Worker, E2E di runner |
| Dev lokal | `pnpm dev` = Vite + `wrangler dev` | D1 & Durable Objects lokal lewat Miniflare, tanpa Docker |
| Relay produksi | Cloudflare Workers (paket gratis) | Deploy pertama di W12 |
| Web produksi | Vercel (statis, Root Directory `apps/web`) | Preview boleh aktif sejak W6 untuk cek tampilan statis saja |

**Gerbang** setiap gelombang dicek lewat: (1) perintah lokal yang disebut di prompt, dan (2) GitHub Actions hijau pada PR gelombang tersebut. Sumber kebenaran adalah CI.

---

# Gelombang

Format setiap gelombang: **Tujuan → Prompt (tempel ke Claude Code) → Gerbang → Langkah manual (jika ada)**.

---

## W0 — Fondasi Monorepo

**Tujuan:** monorepo pnpm yang bisa di-build, lint dengan aturan PRD §12, CI hijau. Konstanta protokol dikunci di sini supaya W1 dan W2 bisa jalan paralel. Belum ada fitur.

**Prompt:**

```text
GELOMBANG 0 — Fondasi Monorepo.
Baca @CLAUDE.md, @docs/DECISIONS.md, dan @BLACKCHAT_PRD.md §2, §3, §4.1, §11, §12, §13.4.
Susun rencana singkat dulu, lalu eksekusi.

Tugas:
1. git init, branch main. .gitignore: node_modules, dist, .wrangler, .env, .env.* (kecuali .env.example),
   .dev.vars, coverage, playwright-report, test-results, .DS_Store.
2. Monorepo pnpm 9: pnpm-workspace.yaml (apps/*, packages/*), package.json root dengan "packageManager",
   "engines": {"node": "22.x"}, dan script: dev, build, lint, typecheck, test, test:relay, test:e2e, check:inline
   (yang belum ada boleh echo TODO). .nvmrc (22), .editorconfig, .npmrc (save-exact=true).
3. tsconfig.base.json: strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, ES2022,
   moduleResolution "bundler".
4. ESLint flat config + Prettier di root. Aturan wajib (PRD §12):
   - no-console: error (semua paket kecuali file test & script)
   - no-restricted-properties / no-restricted-syntax untuk innerHTML, outerHTML, insertAdjacentHTML,
     document.write, eval, new Function
   - svelte/no-at-html-tags: error
   - no-restricted-globals / aturan setara untuk localStorage di luar apps/web/src/lib/theme.ts dan
     sessionStorage/indexedDB di luar apps/web/src/lib/session.ts
   Tambahkan satu file fixture yang melanggar tiap aturan di test lint (pastikan ESLint benar-benar menolaknya),
   lalu jangan sertakan fixture itu di lint normal.
5. Kerangka paket (masing-masing package.json, tsconfig, vitest, src/index.ts, 1 test dummy):
   - packages/protocol: src/{types,constants,validate,encoding}.ts. ISI LENGKAP constants.ts sekarang:
     semua label domain separation "bc-*-v1" yang disebut PRD §4–§6 DITAMBAH "bc-inbox-room-v1" (D-001),
     parameter Argon2id (D-002), TTL yang diizinkan [3,5,7,10], batas: 2000 karakter teks, 300 caption,
     15 MB input gambar, 1600 px, 1.5 MB hasil, chunk 262144 byte, frame maks 300 KB, 200 pesan & 30 MB per room,
     150 MB per akun, umur akun 72 jam, sesi 10 menit, peringatan 60 dtk, heartbeat 25 dtk, upload deadline 10 menit,
     used_nonces 10 menit, burn grace 300 ms, padding teks 256, padding kontak 4096, regex username.
     Semua `as const`. Sisanya (types/validate/encoding) cukup stub.
   - packages/crypto: src/{keys,pwhash,seal,aead,room,ids,pad}.ts stub.
   - apps/relay: kerangka Worker (src/index.ts → 404), wrangler.toml persis PRD §11.2 + [env.test] dengan
     define __BC_TEST__ = "true" (D-006), migrations/0001_init.sql persis PRD §5.1, src/clock.ts (D-006).
   - apps/web: Vite + Svelte 5 + TypeScript, App.svelte berisi "blackchat". Tanpa UI kit.
6. Pin versi persis semua dependensi (tanpa ^ atau ~). Catat setiap dependensi + alasannya di README.md
   bagian "Dependensi".
7. GitHub Actions .github/workflows/ci.yml (Node 22, pnpm cache): install --frozen-lockfile, lint, typecheck,
   test, build. Semua action dipin ke commit SHA (sertakan komentar versi). Tambahkan .github/dependabot.yml
   (npm + github-actions, mingguan).
8. README.md singkat: apa ini, prasyarat (Node 22, pnpm 9 via corepack), perintah, alur branch → PR.
   .env.example untuk web (VITE_RELAY_URL) dan apps/relay/.dev.vars.example (SALT_SECRET).

Larangan: jangan menulis fitur, jangan menambah dependency di luar yang dibutuhkan kerangka.

Gerbang (jalankan & laporkan output-nya):
- pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
- test lint fixture: ESLint menolak setiap pelanggaran
- push branch w0-fondasi, buka PR; ci.yml hijau

Selesai: update docs/PROGRESS.md, commit "chore(w0): monorepo foundation", push, buka PR, BERHENTI dan laporkan.
```

**Gerbang:**
- [ ] `ci.yml` hijau di PR W0.
- [ ] `constants.ts` memuat semua label dan batas (dicek manual sekilas terhadap PRD §4–§6, §13).
- [ ] ESLint menolak `innerHTML`, `{@html}`, `console.log`, dan `localStorage` di luar `theme.ts`.

**Langkah manual (sekali saja, sebelum W0):**
1. Buat repo kosong `blackchat` di GitHub (private dulu), tanpa README.
2. Pastikan `gh auth status` sudah login supaya Claude bisa push dan membuka PR.
3. Aktifkan 2FA (passkey/security key) di GitHub (PRD §16.1).

---

## W1 — Protocol

**Tujuan:** tipe, encoding, dan validator untuk semua data yang melintasi jaringan. Ini lapisan pertahanan pertama relay dan client (Aturan Emas 7).

**Bisa paralel dengan:** W2, W6.

**Prompt:**

```text
GELOMBANG 1 — Protocol.
Baca @CLAUDE.md, @docs/DECISIONS.md (D-001), dan @BLACKCHAT_PRD.md §4.2, §4.7, §5.2, §6.1, §6.2, §6.5, §13.2.

Tugas di packages/protocol:
1. encoding.ts: base64url (tanpa padding), hex, base32-crockford, utf8, canonical JSON (kunci diurutkan,
   tanpa spasi, tolak NaN/Infinity/undefined), u32 big-endian. Tanpa dependensi luar.
2. types.ts: tipe untuk semua body endpoint akun (PRD §5.2), semua frame WS client→server dan server→client
   (PRD §6.5, disesuaikan D-001: roomId + myInboxRoomId + peerInboxRoomId pada frame yang memicu notifikasi),
   record pesan RoomDO, Inner (PRD §4.7), header tersegel, isi blob kontak, frame biner chunk (PRD §13.2).
   Setiap frame client punya reqId.
3. validate.ts: validator tulisan tangan (tanpa Zod, supaya bundle kecil) yang mengembalikan
   {ok:true, value} | {ok:false, error}. Cek tipe, panjang persis untuk kunci/nonce/tag (dalam byte setelah decode),
   alfabet (base64url/hex/base32), regex username, enum (ttl, t, kind, action), batas ukuran dari constants.ts,
   dan tolak field tak dikenal. parseBinaryChunkFrame() untuk frame 13.2 (cek panjang header, idx, ukuran maks).
4. Test Vitest: untuk SETIAP validator minimal satu kasus valid dan kasus cacat untuk tiap field
   (tipe salah, terlalu panjang/pendek, alfabet salah, field ekstra, field hilang, angka negatif/float/NaN).
   Test canonical JSON stabil (urutan kunci tidak memengaruhi output) dan round-trip semua encoding.

Larangan: jangan import libsodium di paket ini. Jangan longgarkan validator demi kemudahan.

Gerbang: pnpm --filter @blackchat/protocol test (laporkan jumlah test), pnpm lint, pnpm typecheck; CI hijau.
Selesai: update docs/PROGRESS.md, commit "feat(w1): protocol types, encoding, validators", push, buka PR,
BERHENTI dan laporkan.
```

**Gerbang:**
- [ ] Semua frame di PRD §6.5 (versi D-001) punya tipe dan validator.
- [ ] Test negatif ada untuk setiap field; CI hijau.

---

## W2 — Crypto Inti

**Tujuan:** pembungkus libsodium untuk identitas, password → kunci, vault, AEAD, sealed box, padding, dan safety number.

**Bisa paralel dengan:** W1, W6.

**Prompt:**

```text
GELOMBANG 2 — Crypto inti.
Baca @CLAUDE.md, @docs/DECISIONS.md (D-002), dan @BLACKCHAT_PRD.md §4.1–§4.4, §4.8, §12 aturan 9, 11, 12.

Tugas di packages/crypto (libsodium-wrappers-sumo, versi persis; inisialisasi lewat satu ready() bersama):
1. keys.ts: generateIdentity() → {edPk, edSk, xPk, xSk, xPkSig, userId} sesuai PRD §4.2
   (xPkSig = Ed25519(edSk, "bc-xpk-v1" || xPk); userId = base32-crockford(BLAKE2b-160(edPk))).
   verifyXPk(edPk, xPk, xPkSig). sign/verify dengan label (label || canonical(fields)) untuk request bertanda tangan.
2. pwhash.ts: deriveKeys(password, salt) → {authKey, vaultKey} sesuai PRD §4.3 dengan parameter D-002.
   master di-memzero setelah dipakai. checkPasswordPolicy(username, password) memakai daftar 1.000 password umum
   yang dibundel (sertakan sumber & lisensinya di README).
3. aead.ts: encrypt/decrypt XChaCha20-Poly1305 dengan nonce 24 byte acak, aad wajib.
   Vault: sealVault(vaultKey, {edSk, xSk}) / openVault().
4. seal.ts: crypto_box_seal / seal_open.
5. pad.ts: padText(256), padContacts(4096), padImage(262144), unpad; tolak padding rusak.
6. ids.ts: randomId(16) base64url, opNonce(16).
7. safety.ts: safetyNumber(edPkA, edPkB) → 60 digit (12 × 5) dari BLAKE2b-256(sort(edPkA, edPkB)),
   simetris (urutan argumen tidak berpengaruh).
8. Contacts blob: sealContacts(vaultKey, list) / openContacts() sesuai PRD §4.8.
9. Semua fungsi yang menerima rahasia mendokumentasikan siapa yang wajib memzero output-nya.
   Perbandingan rahasia memakai sodium.memcmp.

Test Vitest (PRD §15.1 bagian crypto):
- deriveKeys deterministik untuk password+salt yang sama, berbeda untuk salt berbeda; authKey ≠ vaultKey.
- Vault round-trip; vault dengan vaultKey salah gagal; ciphertext diubah 1 bit gagal.
- xPkSig valid; xPk tertukar → verify gagal.
- Sealed box round-trip; kunci salah gagal.
- Padding: hasil selalu kelipatan blok; unpad padding rusak ditolak.
- Safety number simetris dan 60 digit.
- Vektor uji tetap (seed/salt tetap) disimpan di test/vectors.json supaya perubahan tak sengaja terdeteksi.

Larangan: tidak ada primitif buatan sendiri, tidak ada Math.random, tidak ada console.

Gerbang: pnpm --filter @blackchat/crypto test, lint, typecheck; CI hijau.
Selesai: update docs/PROGRESS.md, commit "feat(w2): core crypto (identity, pwhash, vault, aead, seal, pad)",
push, buka PR, BERHENTI dan laporkan.
```

**Gerbang:**
- [ ] Semua test di atas hijau, termasuk vektor uji tetap.
- [ ] Waktu `deriveKeys` di Node dilaporkan (sebagai gambaran; di browser diukur ulang di W7).

---

## W3 — Crypto Room & Pesan

**Tujuan:** bagian kripto paling khas BlackChat: room tanpa identitas anggota, member proof, enkripsi pesan untuk penerima offline, `Inner` bertanda tangan, dan enkripsi chunk gambar.

**Bisa paralel dengan:** W4, W6.

**Prompt:**

```text
GELOMBANG 3 — Crypto room & pesan.
Baca @CLAUDE.md, @docs/DECISIONS.md (D-001, D-007), dan @BLACKCHAT_PRD.md §4.5, §4.6, §4.7, §6.1 (sealed_header), §7.3.

Tugas di packages/crypto:
1. room.ts:
   - deriveRoom(myXSk, peerXPk, myEdPk, peerEdPk) → {shared, roomId, myInboxRoomId, peerInboxRoomId,
     myMemberKey, myMemberTag, peerMemberKey, peerMemberTag} sesuai PRD §4.6 + D-001.
   - memberProof(memberKey, opNonce, opHash) dan verifyMemberProof() (constant-time). opHash =
     BLAKE2b-256(canonical(op tanpa proof)).
   - Relay TIDAK memakai paket ini (D-007). Ekspor test/vectors-room.json berisi input & output tetap untuk
     memberKey, memberTag, opHash, dan proof, supaya relay di W5 bisa membuktikan perhitungannya identik.
2. header.ts: sealHeader(ownerXPk, {peerUserId, peerEdPk, peerXPk, peerXPkSig, peerUsername,
   peerExpiresAt}) / openHeader(); peerExpiresAt dibulatkan ke jam penuh.
3. message.ts:
   - buildInner() + signInner() + verifyInner(inner, expectedPeerEdPk, expectedRoomId, expectedMsgId).
   - encryptMessage({inner, roomId, msgId, myXPk, peerXPk}) → {body, keyForPeer, keyForSelf} sesuai PRD §4.5
     (teks di-pad 256 sebelum dienkripsi; contentKey di-memzero).
   - decryptMessage(record, mySk, isMine) → Inner, menolak sesuai aturan PRD §4.7 baris terakhir.
   - effectiveTtl(innerTtl, recordTtl) = min.
4. image.ts: encryptImageChunks(bytes, contentKey, roomId, msgId) → chunk berukuran PERSIS 262144 byte +
   overhead AEAD yang sama untuk semua chunk (pad dulu ke kelipatan 256 KB, PRD §4.5 langkah 3), hash gambar;
   decryptImageChunks() memverifikasi AAD per index dan hash akhir.

Test Vitest (PRD §15.1):
- roomId, kedua inboxRoomId, memberKey, memberTag identik dihitung dari sisi A maupun B.
- myInboxRoomId ≠ peerInboxRoomId ≠ roomId (D-001).
- Proof valid diterima; proof dengan memberKey lain, opNonce lain, atau op diubah ditolak.
- Pesan: A mengenkripsi, B membuka dengan keyForPeer, A membuka dengan keyForSelf; pihak ketiga gagal.
- verifyInner menolak: sig salah, fromEdPk bukan lawan, roomId/msgId tidak cocok, ttl di luar enum, teks > 2000.
- Chunk: gambar 10 KB dan 1.4 MB menghasilkan chunk dengan ukuran byte identik; index tertukar → gagal;
  hash tidak cocok → gagal.
- Header tersegel round-trip; hanya pemilik yang bisa membuka.

Gerbang: pnpm --filter @blackchat/crypto test, lint, typecheck; CI hijau.
Selesai: update docs/PROGRESS.md (+ keputusan baru di DECISIONS.md jika ada), commit
"feat(w3): room derivation, member proof, message & image encryption", push, buka PR, BERHENTI dan laporkan.
```

**Gerbang:**
- [ ] Test "dua sisi menghitung nilai yang sama" dan "pihak ketiga gagal" hijau.
- [ ] Ukuran semua chunk identik untuk gambar kecil dan besar.
- [ ] `test/vectors-room.json` tersedia untuk dipakai relay di W5.

---

## W4 — Relay: Akun & Limiter

**Tujuan:** endpoint akun HTTP, D1, verifikasi tanda tangan, rate limit, cron pembersih, dan jam yang bisa dimajukan untuk test.

**Bisa paralel dengan:** W3, W6.

**Prompt:**

```text
GELOMBANG 4 — Relay: akun & limiter.
Baca @CLAUDE.md, @docs/DECISIONS.md (D-002, D-003, D-004, D-006, D-007), dan @BLACKCHAT_PRD.md §5.1–§5.3, §6.4,
§11.2, §12, §13.4, §15.1 (bagian Worker).

Tugas di apps/relay:
1. clock.ts (D-006): now(); di __BC_TEST__ bisa diberi offset. Route POST /__test/clock dan
   POST /__test/cron hanya ada di build test.
2. verify.ts: verifikasi Ed25519 dengan WebCrypto (Ed25519 didukung Workers), timingSafeEqual untuk authHash.
   hash.ts: BLAKE2b dengan @noble/hashes (D-007) + test kompatibilitas terhadap vektor libsodium dari
   @blackchat/crypto (keyed & unkeyed, 16/20/32 byte).
3. account.ts + index.ts (router), semua endpoint PRD §5.2:
   - register (D-004: DELETE baris hangus + INSERT dalam satu batch), salt (salt palsu deterministik
     BLAKE2b(SALT_SECRET, username) untuk username tak ada atau hangus), login (pesan error umum),
     lookup (expiresAt dibulatkan ke bawah ke jam penuh), contacts, password, delete
     (InboxDO.destroy() boleh stub sampai W5).
   - Semua request bertanda tangan: sig atas label || canonical(fields), seq harus naik.
   - Akun dengan expires_at <= now() diperlakukan tidak ada di SEMUA handler.
   - Semua body divalidasi dengan @blackchat/protocol. Cache-Control: no-store. CORS hanya ALLOWED_ORIGIN.
   - Tidak membaca/menyimpan IP selain untuk kunci limiter (hash, di memori).
4. limiter.ts: LimiterDO 16 shard, tanpa storage, kunci ip: dan user: (D-003), batas PRD §6.4.
5. scheduled(): DELETE FROM accounts WHERE expires_at <= now().
6. Test @cloudflare/vitest-pool-workers:
   register/login sukses; login password salah → pesan umum; salt palsu stabil & tidak bisa dibedakan dari asli
   (panjang & format sama); lockout per username setelah 5 gagal dengan jeda berlipat; rate limit register 3/jam;
   akun hangus ditolak di login/lookup/contacts (majukan jam 72 jam); cron menghapus akun hangus;
   username hangus bisa didaftarkan ulang sebelum cron berjalan (D-004); seq lama ditolak; sig salah ditolak;
   lookup expiresAt kelipatan 1 jam; tabel accounts tidak punya kolom IP/UA/waktu login.

Gerbang: pnpm test:relay, lint, typecheck; CI hijau. Tambahkan langkah CI yang membangun bundle produksi relay
(wrangler deploy --dry-run --outdir) dan memastikan tidak ada string "__test/" di dalamnya (D-006).
Selesai: update docs/PROGRESS.md, commit "feat(w4): relay accounts, limiter, cron", push, buka PR,
BERHENTI dan laporkan.
```

**Gerbang:**
- [ ] Semua test Worker bagian akun di PRD §15.1 hijau.
- [ ] Bundle produksi relay tidak mengandung route `__test/`.

**Langkah manual (boleh ditunda sampai W12):** buat akun Cloudflare dan aktifkan 2FA.

---

## W5 — Relay: InboxDO & RoomDO

**Tujuan:** inti realtime: satu socket per akun, routing antar-inbox tanpa menyimpan relasi, RoomDO yang tidak tahu anggotanya, alarm lebur dan hangus. Versi teks dulu (tanpa chunk, retract, ttl).

**Prompt:**

```text
GELOMBANG 5 — Relay: InboxDO & RoomDO (teks).
Baca @CLAUDE.md, @docs/DECISIONS.md (D-001, D-005, D-006, D-007), dan @BLACKCHAT_PRD.md
§2.1, §5.3, §6.1–§6.3, §6.5, §7.2 (bagian server), §12, §13.1, §13.3.

Tugas di apps/relay:
1. inbox.ts — InboxDO (nama inbox:<userId>):
   - GET /v1/ws/:userId → challenge-response Ed25519 (PRD §6.1), cek akun ada & belum hangus di D1.
   - Hibernatable WebSocket API, setWebSocketAutoResponse untuk ping/pong (PRD §13.1).
     Satu socket per akun: koneksi baru menutup yang lama dengan kode 4409.
   - Tabel rooms(room_id = inboxRoomId milik pemilik (D-001), sealed_header, unread). Tanpa kolom waktu.
   - Frame: rooms, rooms.setUnread, rooms.forget, room.init, room.sync, room.send, room.opened, room.purge.
     Setiap frame divalidasi, dibalas result{reqId}.
   - RPC dari InboxDO lain: touch(inboxRoomId, sealedHeader?, unreadDelta), event(inboxRoomId, payload).
   - Penjaga akun mati (PRD §6.1): sebelum menulis apa pun, cek D1; jika tidak ada/hangus → tolak + deleteAll().
     room.send ke akun tujuan yang sudah tidak ada → tolak tanpa membuat storage di InboxDO tujuan.
   - Alarm di expiresAt: tutup socket, deleteAll(). Frame "expiring" dikirim sesuai PRD §6.5.
   - destroy() untuk DELETE /v1/account (sambungkan endpoint dari W4).
2. room.ts — RoomDO (nama room:<roomId>): skema PRD §6.2, operasi init, send, sync, opened, purge
   (getChunk/putChunk/retract/ttl di W9–W10). Verifikasi proof + opNonce (anti-replay 10 menit) di setiap op.
   init: expire_at = floor_jam(min(expiresAt A, expiresAt B)) dari nilai ASLI D1; kasus mulai bersamaan
   dengan member sama → sukses + kembalikan ttl berlaku; member berbeda → tolak.
   opened: hanya penerima, burn_at = now + ttl*1000 + 300, kembalikan remainingMs.
   sync: pesan uploaded=1, sertakan remainingMs untuk yang sudah dibuka.
   Alarm: nilai paling awal dari burn_at, upload_deadline, expire_at; langkah 1–5 PRD §6.2.
   Batas 200 pesan tertunda → room_full. Hapus record + chunk dalam satu transaksi.
   Verifikasi proof memakai hash.ts (D-007) dan wajib lulus test/vectors-room.json dari W3.
3. Alur notifikasi PRD §6.3 dengan D-001 (InboxDO A memanggil InboxDO B memakai peerInboxRoomId).
4. Test vitest-pool-workers (pakai @blackchat/crypto untuk membuat identitas & proof sungguhan):
   - Dua client test: A init room, kirim teks saat B offline; B connect, rooms → sync → menerima.
   - Proof salah ditolak; opNonce dipakai ulang ditolak; hanya penerima bisa opened; pengirim opened → ditolak.
   - Alarm menghapus pesan pada burn_at (majukan jam); sync setelahnya tidak mengembalikan pesan itu.
   - Akun dimajukan 72 jam: InboxDO kosong, RoomDO deleteAll, ws ditolak.
   - Kirim ke akun hangus ditolak dan storage InboxDO tujuan tetap kosong.
   - Koneksi kedua menutup yang pertama dengan 4409.
   - Privasi storage: setelah A↔B bertukar pesan, dump storage InboxDO A, InboxDO B, RoomDO →
     tidak ada userId/username/public key di RoomDO, tidak ada kolom waktu di rooms, dan TIDAK ADA nilai
     room_id yang sama di InboxDO A dan B (D-001).
   - expire_at room kelipatan 1 jam dan ≤ expires_at kedua akun.

Gerbang: pnpm test:relay, lint, typecheck; CI hijau.
Selesai: update docs/PROGRESS.md, commit "feat(w5): InboxDO, RoomDO, notification flow, alarms", push,
buka PR, BERHENTI dan laporkan.
```

**Gerbang:**
- [ ] Test "privasi storage" hijau (inti klaim produk).
- [ ] Pertukaran pesan dua client test lewat WS berhasil, termasuk penerima offline.
- [ ] Alarm lebur dan hangus terbukti menghapus data dengan jam yang dimajukan.

---

## W6 — Web: Fondasi & UI Statis

**Tujuan:** identitas visual, layar statis, efek lebur, perlindungan tampilan, dan CSP ketat. Tanpa logika jaringan.

**Bisa paralel dengan:** W1–W5.

**Prompt:**

```text
GELOMBANG 6 — Web: fondasi & UI statis.
Baca @CLAUDE.md dan @BLACKCHAT_PRD.md §9, §10 (semua), §11.1, §12.

Tugas di apps/web:
1. styles/tokens.css persis PRD §10.2 + base.css. Tema gelap default, terang dibalik total,
   prefers-color-scheme + toggle manual (lib/theme.ts, satu-satunya pemakai localStorage).
   Tanpa warna lain, bayangan, atau gradien.
2. Font self-hosted di public/fonts (Instrument Sans, Martian Mono, woff2, lisensi OFL disertakan).
3. lib/strings.ts: SEMUA teks UI dari PRD §10.3 dan §10.6, sentence case.
4. Router layar sederhana di memori (tanpa URL berisi data, PRD §12 aturan 8).
   Layar statis (data contoh, belum terhubung): Welcome, Register, Login, Home, Chat, Verify, Settings, Expired
   sesuai wireframe PRD §10.3. Komponen: SecretBubble, AccountClock (format PRD §10.3), TimerPicker,
   Composer, ContextMenu (keyboard Shift+F10/Menu, Esc, klik di luar).
5. components/BurnFx.svelte persis PRD §10.4 (grid 4 px, jatuh 8–24 px, 600 ms; reduced-motion: fade 200 ms).
   Halaman demo internal (hanya di dev) untuk mencoba efeknya.
6. lib/guard.ts PRD §9: overlay hitam saat blur/hidden, blok copy/cut/dragstart, user-select none,
   @media print, menu konteks bawaan dimatikan di area chat. Watermark samar (komponen, isi diisi W8).
7. vercel.json persis PRD §11.1; RELAY_HOST diganti saat build dari VITE_RELAY_URL.
   Script check:inline: gagal jika dist/index.html berisi <script> atau <style> inline atau atribut style/on*.
8. Kualitas PRD §10.7: responsif dari 320 px, lebar konten maks 640 px, fokus keyboard terlihat, kontras AA.
   Laporkan ukuran bundle JS gzip (tanpa libsodium) — harus < 100 KB.
9. Test: unit untuk format AccountClock dan guard (event diblok); Playwright smoke: semua layar statis
   ter-render di 320×568 dan 1280×800 tanpa error konsol dan tanpa pelanggaran CSP.

Gerbang: pnpm --filter web build && pnpm check:inline, test, lint, typecheck; CI hijau (tambahkan check:inline
dan Playwright smoke ke ci.yml).
Selesai: update docs/PROGRESS.md, commit "feat(w6): web foundation, static screens, BurnFx, guard", push,
buka PR, BERHENTI dan laporkan.
```

**Gerbang:**
- [ ] `check:inline` lulus; tidak ada pelanggaran CSP di smoke test.
- [ ] Bundle JS < 100 KB gzip tanpa libsodium.
- [ ] Efek lebur terlihat seperti PRD §10.4 (cek mata sendiri di `pnpm dev`).

**Langkah manual (opsional):** hubungkan repo ke Vercel (Root Directory `apps/web`) untuk preview tampilan statis. Matikan Vercel Analytics & Speed Insights.

---

## W7 — Web: Akun, Sesi & Koneksi

**Tujuan:** register/login sungguhan, sesi tahan refresh yang terikat ke satu tab dan terkunci setelah 10 menit, satu koneksi WS dengan reconnect.

**Prompt:**

```text
GELOMBANG 7 — Web: akun, sesi & koneksi.
Baca @CLAUDE.md, @docs/DECISIONS.md, dan @BLACKCHAT_PRD.md §4.2, §4.3, §5.2–§5.4 (WAJIB baca §5.4 utuh),
§6.1 (handshake), §10.3 (Register, Login, Expired, AccountClock), §13.1, §13.3.

Tugas di apps/web/src/lib:
1. account.ts: register (cek ketersediaan username, kebijakan password, Argon2id di Web Worker supaya UI
   tidak beku, tampilkan "Mengamankan akun..."), login (salt → deriveKeys → login → openVault), logout,
   countdown umur akun dari remainingMs.
2. session.ts persis PRD §5.4 langkah 1–9: sessionKey AES-GCM non-extractable di IndexedDB `sessions`,
   bc.tab / bc.sess / bc.view di sessionStorage, lastActive (throttle 15 dtk), cek selisih waktu tiap 15 dtk dan
   saat visibilitychange/focus, peringatan 60 dtk dengan "Tetap masuk", pembersihan entri basi saat load,
   tab duplikat (BroadcastChannel "bc-tab", kunci baru, tab lama menampilkan pesan + "Gunakan di sini").
   Aktivitas hanya pointerdown/keydown/wheel/touchstart/scroll.
3. ws.ts: satu koneksi ke InboxDO, challenge-response, reqId → Promise result, heartbeat 25 dtk,
   reconnect backoff 0.5→1→2→4→maks 10 dtk + jitter, status "Menyambung ulang...". Kode 4409 → layar
   "Akun ini sedang dibuka di tab lain."
4. Sambungkan layar Register, Login, Home (daftar kosong), AccountClock (peringatan 24 jam, 1 jam, 5 menit),
   Expired. Saat akun hangus/terkunci/logout: memzero semua kunci, tutup WS, bersihkan storage sesi.
5. pnpm dev menjalankan Vite + wrangler dev bersamaan (D-005).
6. Test:
   - Unit: session state machine dengan jam palsu (kunci tepat 10 menit, peringatan di 9 menit, tab tersembunyi).
   - Playwright (relay lokal): register → Home → refresh tetap masuk → tutup tab, tab baru → Login;
     page.clock maju 10 menit tanpa aktivitas → terkunci, IndexedDB sessions & sessionStorage bc.* kosong;
     tab duplikat → tab lama menampilkan pesan; tidak ada request ke host selain origin & relay.
   - Ukur & laporkan durasi Argon2id di Chromium dan WebKit Playwright.

Gerbang: pnpm test, pnpm test:e2e, lint, typecheck, check:inline; CI hijau (CI menjalankan relay lokal untuk E2E).
Selesai: update docs/PROGRESS.md, commit "feat(w7): account, tab-bound session, websocket", push, buka PR,
BERHENTI dan laporkan.
```

**Gerbang:**
- [ ] Kriteria PRD §15.2 tentang sesi (refresh, kunci 10 menit, tab baru, tab duplikat, storage kosong) hijau di E2E.
- [ ] Durasi Argon2id di browser dilaporkan; jika > 5 dtk, bahas sebelum lanjut.

---

## W8 — Chat Teks End-to-End

**Tujuan:** alur utama produk: cari username, mulai percakapan, kirim teks, timer mulai saat dilihat, lebur berurutan, sinkronisasi.

**Prompt:**

```text
GELOMBANG 8 — Chat teks end-to-end.
Baca @CLAUDE.md, @docs/DECISIONS.md (D-001), dan @BLACKCHAT_PRD.md §4.5–§4.7, §6.3, §7.1, §7.2 (WAJIB utuh),
§7.6, §8, §9, §10.3 (Home, Chat), §10.6.

Tugas di apps/web/src/lib dan screens:
1. rooms.ts: ambil rooms → buka header tersegel → daftar (belum dibuka di atas, sisanya alfabetis; pindah ke atas
   saat ada pesan baru, hanya di memori). Mulai percakapan: lookup → pilih timer → deriveRoom → room.init
   (sealed header untuk diri & lawan) → Chat. Lawan hangus/hilang/edPk beda → rooms.forget + "Akun @x sudah
   tidak ada." Simpan lastRoomId di bc.sess; refresh membuka room yang benar.
2. messages.ts: kirim (Inner → encryptMessage → room.send), terima (event new → room.sync(lastSeq) →
   decryptMessage), status PRD §7.1, rooms.setUnread dengan jumlah sebenarnya setelah sync.
   Pesan yang hilang dari hasil sync → hancurkan lokal. Plaintext di-set null saat lebur.
3. visibility.ts: "dilihat" = room terbuka + tab fokus & terlihat + ≥ 50% bubble di viewport. Antrean
   berurutan: hanya pesan terdepan ditampilkan, sisanya balok tersensor "Menunggu giliran"; room.opened hanya
   untuk satu pesan terdepan; pesan berikutnya dibuka setelah lebur + animasi 600 ms selesai.
4. Timer pakai remainingMs + performance.now(); garis menyusut + sisa detik; BurnFx saat habis;
   "Dilebur" lalu hilang setelah 3 dtk. Pesan sendiri selalu tampil, "Belum dibuka" sampai event opened.
5. Watermark 6 karakter terakhir userId penerima di atas teks (PRD §9). Teks dirender sebagai text node.

Test Playwright (2 browser context, relay lokal), kriteria PRD §15.2:
- A kirim saat B offline; B login kemudian dan menerima.
- Timer mulai hanya saat pesan terlihat di layar B; hilang dari DOM kedua pihak setelah 3/5/7/10 dtk (± 500 ms);
  berlaku juga B → A.
- B menutup tab setelah timer mulai → pesan tetap terhapus di server (cek via room.sync dari client test).
- 5 pesan sekaligus: hanya yang pertama terbaca, sisanya "Menunggu giliran", melebur satu per satu.
- Pesan <img src=x onerror=alert(1)> tampil sebagai teks.
- Refresh membuka room yang benar walau urutan daftar berubah; timer yang berjalan tetap akurat.
- Lawan hangus lalu username didaftarkan orang lain → tidak ada dua "@rara" di daftar.

Gerbang: pnpm test, pnpm test:e2e, lint, typecheck, check:inline; CI hijau. Laporkan apakah ada test yang flaky
(jalankan E2E 3×).
Selesai: update docs/PROGRESS.md, commit "feat(w8): end-to-end text chat with view-triggered burn", push,
buka PR, BERHENTI dan laporkan.
```

**Gerbang:**
- [ ] Semua kriteria §15.2 di prompt hijau, 3× berturut-turut tanpa flaky.
- [ ] Coba manual dengan dua browser: rasanya sesuai PRD (timer, antrean, efek lebur).

---

## W9 — Batalkan Pesan & Kesepakatan Timer

**Tujuan:** pengirim bisa membatalkan pesan; timer percakapan hanya berubah atas persetujuan kedua pihak.

**Prompt:**

```text
GELOMBANG 9 — Batalkan pesan & kesepakatan timer.
Baca @CLAUDE.md, @docs/DECISIONS.md, dan @BLACKCHAT_PRD.md §6.2 (retract, proposeTtl/answerTtl), §6.5
(room.retract, room.ttl, event retracted/ttl_*), §7.3, §7.4, §10.5, §10.6.

Tugas:
1. Relay: RoomDO retract (hanya pengirim, hapus record + chunk satu transaksi), proposeTtl/answerTtl (jawaban
   hanya dari anggota lain), frame & event di InboxDO, notifikasi ke lawan lewat peerInboxRoomId (D-001).
2. Web: ContextMenu di bubble sendiri (klik kanan / tekan lama 500 ms / Shift+F10), keterangan "Sudah dilihat..."
   jika sudah dibuka; bubble lawan tidak memunculkan menu apa pun. Status retracted per PRD §7.1.
   Header chat: "⧗ N dtk" → usulkan timer; banner usulan "( Setuju ) ( Tolak )"; pesan mulai bersamaan
   "Kalian memulai bersamaan. Timer yang berlaku N detik."
3. Test Worker: hanya pengirim bisa retract; retract menghapus record & chunk; jawaban ttl dari pengusul ditolak.
   Test Playwright: batalkan → hilang di kedua sisi & server; klik kanan pesan lawan → tidak ada menu;
   usulan timer hanya berlaku setelah disetujui; A dan B mulai bersamaan dengan timer berbeda → room sama,
   timer sama.

Gerbang: pnpm test, test:relay, test:e2e, lint, typecheck; CI hijau.
Selesai: update docs/PROGRESS.md, commit "feat(w9): retract messages, ttl agreement", push, buka PR,
BERHENTI dan laporkan.
```

**Gerbang:**
- [ ] Kriteria §15.2 tentang batalkan, menu konteks, usulan timer, dan mulai bersamaan hijau.

---

## W10 — Gambar

**Tujuan:** kirim gambar terenkripsi tanpa metadata, chunk berukuran identik, tampil di canvas, melebur seperti teks.

**Prompt:**

```text
GELOMBANG 10 — Gambar.
Baca @CLAUDE.md, @docs/DECISIONS.md, dan @BLACKCHAT_PRD.md §4.5 (langkah 3), §6.1 (kuota), §6.2 (putChunk,
getChunk, upload_deadline, batas room), §7.2 (gambar & 60% tinggi layar), §7.5, §13.2.

Tugas:
1. Relay: frame biner chunk (PRD §13.2) di InboxDO, putChunk (hanya pengirim, maks 300 KB), getChunk (hanya
   pesan belum melebur), uploaded=0 sampai lengkap, upload_deadline 10 menit + alarm, batas 30 MB per room,
   kuota 150 MB per akun (uploaded_bytes di InboxDO) → quota_exceeded. Rate limit upload 60/menit.
2. Web lib/images.ts: input lampiran/paste/drag-drop, JPEG/PNG/WebP/HEIC (jika bisa di-decode), maks 15 MB;
   createImageBitmap → canvas → sisi terpanjang 1600 px → WebP 0.8 (fallback JPEG 0.85), turunkan kualitas
   sampai ≤ 1.5 MB; enkripsi chunk (W3); upload maks 2 chunk bersamaan, tunggu result per chunk; progres di bubble;
   batalkan saat upload menghentikan upload.
3. SecretImage.svelte: unduh semua chunk → dekripsi → cek hash → canvas (bukan <img>), tinggi maks 60% layar,
   watermark; timer mulai setelah tergambar; lebur: BurnFx → clearRect, bitmap.close(), memzero buffer.
   Caption opsional maks 300 karakter melebur bersama gambar.
4. Test Worker: semua chunk tersimpan berukuran identik; chunk > 300 KB ditolak; upload terputus terhapus
   setelah 10 menit (majukan jam); kuota akun & batas room.
   Test Playwright: gambar dengan GPS EXIF (fixture) → byte yang didekripsi di sisi B tidak mengandung EXIF;
   gambar tampil di canvas dan melebur sesuai timer; gambar portrait sangat tinggi memicu timer di 320×568;
   gambar > 15 MB → "Gambar maksimal 15 MB."

Gerbang: pnpm test, test:relay, test:e2e, lint, typecheck; CI hijau.
Selesai: update docs/PROGRESS.md, commit "feat(w10): encrypted images with fixed-size chunks", push, buka PR,
BERHENTI dan laporkan.
```

**Gerbang:**
- [ ] Kriteria §15.2 tentang gambar, EXIF, chunk identik, portrait tinggi, dan upload terputus hijau.

---

## W11 — Kontak, Verifikasi, Blokir & Settings

**Tujuan:** deteksi kunci berubah, safety number, blokir tanpa server tahu, ganti password, dan hapus akun yang benar-benar menghapus semua pesan.

**Prompt:**

```text
GELOMBANG 11 — Kontak, verifikasi, blokir & settings.
Baca @CLAUDE.md, @docs/DECISIONS.md, dan @BLACKCHAT_PRD.md §4.3 (ganti password), §4.4, §4.8, §5.2 (contacts,
password, DELETE), §5.3 (username dipakai ulang), §8 (blokir), §10.3 (Verify, Settings), §10.6.

Tugas:
1. Web lib/contacts.ts: blob kontak terenkripsi (PRD §4.8), PUT bertanda tangan dengan seq naik; simpan edPk
   saat pertama chat; bandingkan saat lookup/membuka room → peringatan "@x sekarang memakai kunci berbeda...".
2. lib/safety.ts + Verify.svelte: 60 digit + QR (pilih pustaka QR kecil, pin versi, catat alasan di README),
   "Tandai terverifikasi" disimpan di blob kontak; ikon [✓] di header chat.
3. Blokir dari menu ⋯: konfirmasi PRD §10.6 → room.purge → rooms.forget → blocked=true di blob kontak; room dari
   akun terblokir yang muncul lagi otomatis di-purge & forget tanpa menampilkan isi.
4. Settings: tema; ganti password (salt baru, vault dienkripsi ulang, bertanda tangan); keluar; hapus akun
   sekarang (konfirmasi mengetik username → "Menghapus percakapan..." → room.purge di SETIAP room →
   DELETE /v1/account → layar Welcome).
5. Test Playwright: username hangus didaftarkan lagi → lawan lama mendapat peringatan kunci berbeda;
   blokir menghapus percakapan & pesan berikutnya dari akun itu tidak tampil; setelah hapus akun semua room
   milik akun itu kosong di server; ganti password → login dengan password lama gagal, yang baru berhasil;
   safety number sama di kedua sisi. Test Worker: blob kontak selalu kelipatan 4 KB.

Gerbang: pnpm test, test:relay, test:e2e, lint, typecheck; CI hijau.
Selesai: update docs/PROGRESS.md, commit "feat(w11): contacts, verify, block, settings, delete account", push,
buka PR, BERHENTI dan laporkan.
```

**Gerbang:**
- [ ] Kriteria §15.2 tentang username dipakai ulang, blokir, dan hapus akun hijau.

---

## W12 — Rilis: Deploy, E2E Penuh, Dokumen

**Tujuan:** seluruh PRD §15.2 tercentang, relay dan web live, pipeline rilis aman, dokumen keamanan lengkap.

**Prompt:**

```text
GELOMBANG 12 — Rilis.
Baca @CLAUDE.md, @docs/DECISIONS.md (semua), @docs/PROGRESS.md, dan @BLACKCHAT_PRD.md §11, §12, §14, §15, §16.1.

Tugas:
1. .github/workflows/deploy-relay.yml: push main yang mengubah apps/relay atau packages/protocol → migrasi D1
   remote + wrangler deploy, memakai CLOUDFLARE_API_TOKEN & CLOUDFLARE_ACCOUNT_ID. Tidak pernah echo secret.
2. .github/workflows/release-hash.yml: tag v* → build web → SHA-384 seluruh file dist/ → hashes.txt di GitHub
   Release. Semua action dipin ke SHA.
3. E2E penuh: pastikan SETIAP butir PRD §15.2 punya test yang menunjuk butirnya (komentar "§15.2: ...").
   Buat tabel cakupan di docs/acceptance.md (butir → file test → status). Tambahkan test yang belum ada,
   termasuk "tidak ada request jaringan selain origin & relay; tidak ada pelanggaran CSP".
4. Audit Aturan Emas: grep & lint untuk larangan PRD §12; cek skema D1/DO terhadap aturan 3, 4, 15;
   laporkan hasilnya di PR.
5. README.md lengkap (apa, arsitektur singkat, dev lokal, deploy, daftar dependensi + alasan) dan SECURITY.md
   (model ancaman dari PRD §14 dengan status terbaru, batasan yang diterima #12, 16, 17, 24, 25, D-002 dan D-003,
   cara melaporkan kerentanan, cara memverifikasi hashes.txt).
6. Perbarui docs/PROGRESS.md dengan checklist manual PRD §16.1.

Gerbang: CI hijau termasuk E2E penuh 3× tanpa flaky; docs/acceptance.md menunjukkan semua butir §15.2 lulus.
Setelah user menyelesaikan langkah manual: deploy-relay sukses, web produksi bisa register → chat → lebur
dengan dua perangkat sungguhan.
Selesai: commit "chore(w12): release pipeline, full e2e, security docs", push, buka PR, BERHENTI dan laporkan.
```

**Gerbang:**
- [ ] `docs/acceptance.md`: semua butir PRD §15.2 lulus.
- [ ] Relay dan web produksi live; uji manual dengan dua perangkat sungguhan.

**Langkah manual (PRD §16.1):**
1. 2FA (passkey/security key) di GitHub, Vercel, Cloudflare.
2. Branch protection `main`: wajib PR + CI hijau, signed commits.
3. `wrangler d1 create blackchat` → isi `database_id` di `wrangler.toml` → jalankan migrasi.
4. `wrangler secret put SALT_SECRET` (32 byte acak: `openssl rand -hex 32`).
5. Isi `CLOUDFLARE_API_TOKEN` dan `CLOUDFLARE_ACCOUNT_ID` di GitHub Secrets.
6. Vercel: Root Directory `apps/web`, isi `VITE_RELAY_URL`, matikan Analytics & Speed Insights, aktifkan Deployment Protection.
7. Pastikan `ALLOWED_ORIGIN` di `wrangler.toml` sama dengan domain produksi web.
