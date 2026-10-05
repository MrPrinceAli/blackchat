# blackchat

Chat rahasia satu-lawan-satu dengan enkripsi end-to-end. Pesan melebur beberapa detik setelah dibaca, akun hangus 3 hari setelah dibuat, dan server hanya pernah melihat ciphertext.

> Status: dalam pembangunan. Lihat [docs/PROGRESS.md](docs/PROGRESS.md).

## Dokumen

| Dokumen | Isi |
|---|---|
| [BLACKCHAT_PRD.md](BLACKCHAT_PRD.md) | Spesifikasi lengkap |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Keputusan yang mengoreksi atau melengkapi PRD (berlaku jika bertentangan) |
| [docs/BLACKCHAT-WAVES.md](docs/BLACKCHAT-WAVES.md) | Rencana kerja per gelombang (W0–W12) |
| [CLAUDE.md](CLAUDE.md) | Aturan emas dan protokol kerja untuk Claude Code |

## Struktur

```
apps/web           Vite + Svelte 5 SPA (UI, kriptografi client)
apps/relay         Cloudflare Worker + Durable Objects + D1
packages/protocol  Tipe, konstanta, validator, encoding
packages/crypto    Semua operasi kriptografi client (libsodium)
```

## Prasyarat

- Node 22 (lihat `.nvmrc`)
- pnpm 9 lewat corepack: `corepack enable`

## Perintah

```bash
pnpm install
pnpm dev            # Vite + wrangler dev (D1 & Durable Objects lokal, D-005)
pnpm lint           # ESLint + bukti bahwa aturan PRD §12 aktif
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm check:inline   # HTML build tanpa script/style inline (CSP)
pnpm test:e2e       # Playwright (pertama kali: pnpm exec playwright install chromium)
```

Relay lokal butuh `apps/relay/.dev.vars` (salin dari `.dev.vars.example`).

## Alur kerja

Satu gelombang = satu branch `wN-*` = satu PR. CI (`.github/workflows/ci.yml`) wajib hijau sebelum merge. Detail di [CLAUDE.md](CLAUDE.md).

## Dependensi

Semua versi dipin persis (`.npmrc` `save-exact=true`). Dependensi baru wajib ditambahkan ke tabel ini beserta alasannya (PRD §12 aturan 14).

### Runtime

| Paket | Dipakai di | Alasan |
|---|---|---|
| `libsodium-wrappers-sumo` | packages/crypto | Semua primitif kripto client. Varian sumo dibutuhkan untuk Argon2id (PRD §2.3). Membawa tipe TypeScript sendiri |
| `@noble/hashes` | apps/relay | BLAKE2b di relay (D-007): WebCrypto tidak punya BLAKE2b, libsodium tidak bisa dimuat di Workers. Diaudit, pure JS |
| `svelte` | apps/web | Framework UI, output statis tanpa inline script (CSP ketat) |

### Pengembangan

| Paket | Alasan |
|---|---|
| `typescript` | Typecheck strict seluruh monorepo |
| `vite`, `@sveltejs/vite-plugin-svelte`, `svelte-check` | Build dan typecheck SPA |
| `@noble/hashes` | Test packages/crypto: pemeriksaan silang Argon2id & BLAKE2b dengan implementasi independen |
| `@types/node` | Tipe Node khusus untuk file test (kode `src` tidak boleh memakai API Node) |
| `vitest` | Test unit semua paket. Dipin di 4.x karena `@cloudflare/vitest-pool-workers` (W4) membutuhkan vitest 4 |
| `wrangler`, `@cloudflare/workers-types` | Dev lokal, build, dan deploy relay |
| `@cloudflare/vitest-pool-workers` | Test relay di dalam runtime Workers (workerd) dengan D1 dan Durable Objects lokal |
| `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-svelte`, `svelte-eslint-parser`, `globals` | Lint dengan aturan wajib PRD §12 |
| `prettier`, `prettier-plugin-svelte` | Format kode konsisten |
| `@playwright/test` | Smoke & E2E di browser sungguhan, dengan CSP produksi (`e2e/`) |

## Atribusi

- Font Instrument Sans dan Martian Mono (SIL Open Font License 1.1), subset Latin dari [Fontsource](https://fontsource.org). Lisensi di `apps/web/public/fonts/`.
- Daftar password umum di `packages/crypto/src/common-passwords.ts` diturunkan dari [SecLists](https://github.com/danielmiessler/SecLists) (MIT, © Daniel Miessler). Lihat D-010.
