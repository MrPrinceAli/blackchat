# PROGRESS — BlackChat

Diperbarui di akhir setiap gelombang (lihat `docs/BLACKCHAT-WAVES.md`). Entri terbaru di bawah.

| Gelombang | Nama | Status | PR |
|---|---|---|---|
| W0 | Fondasi monorepo | Selesai (lokal) | branch `w0-fondasi` |
| W1 | Protocol | Selesai (lokal) | branch `w1-protocol` |
| W2 | Crypto inti | Selesai (lokal) | branch `w2-crypto-inti` |
| W3 | Crypto room & pesan | Selesai (lokal) | branch `w3-crypto-room` |
| W4 | Relay: akun & limiter | Belum mulai | — |
| W5 | Relay: InboxDO & RoomDO | Belum mulai | — |
| W6 | Web: fondasi & UI statis | Belum mulai | — |
| W7 | Web: akun, sesi & koneksi | Belum mulai | — |
| W8 | Chat teks end-to-end | Belum mulai | — |
| W9 | Batalkan pesan & kesepakatan timer | Belum mulai | — |
| W10 | Gambar | Belum mulai | — |
| W11 | Kontak, verifikasi, blokir & settings | Belum mulai | — |
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
- Tertunda: push & PR untuk W0–W3; CI belum pernah jalan di GitHub.
- Langkah manual untuk user: buat repo GitHub `blackchat` lalu izinkan push (lihat laporan).
