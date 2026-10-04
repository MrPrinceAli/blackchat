# PROGRESS — BlackChat

Diperbarui di akhir setiap gelombang (lihat `docs/BLACKCHAT-WAVES.md`). Entri terbaru di bawah.

| Gelombang | Nama | Status | PR |
|---|---|---|---|
| W0 | Fondasi monorepo | Selesai (lokal) | branch `w0-fondasi` |
| W1 | Protocol | Selesai (lokal) | branch `w1-protocol` |
| W2 | Crypto inti | Belum mulai | — |
| W3 | Crypto room & pesan | Belum mulai | — |
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
