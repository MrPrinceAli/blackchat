# blackchat

Chat rahasia satu-lawan-satu dengan enkripsi end-to-end. Pesan melebur beberapa detik setelah dibaca, akun hangus 3 hari setelah dibuat, dan server hanya pernah melihat ciphertext.

- **Daftar cukup username + password.** Tidak ada email, tidak ada pemulihan.
- **Pesan teks & gambar** melebur 3/5/7/10 detik setelah **benar-benar dilihat** penerima, satu per satu berurutan.
- **Server tidak menyimpan siapa bicara dengan siapa**, tidak menyimpan IP, dan tidak bisa membaca isi apa pun.
- **Gratis dioperasikan:** GitHub, Vercel (web statis), Cloudflare Workers + Durable Objects + D1 (relay).

Status: fitur lengkap (W0–W11), siap deploy (W12). Lihat [docs/PROGRESS.md](docs/PROGRESS.md) dan [docs/acceptance.md](docs/acceptance.md). Model ancaman: [SECURITY.md](SECURITY.md).

## Arsitektur

```
Browser (Svelte 5 SPA, libsodium)  ──HTTPS──►  Vercel (file statis + header CSP)
        │
        └──WebSocket (1 per akun)──►  Cloudflare Worker (relay)
                                        ├─ D1: akun (username, kunci publik, vault terenkripsi)
                                        ├─ InboxDO (1 per akun): socket, daftar room tersegel
                                        ├─ RoomDO (1 per pasangan, nama = hash rahasia DH): pesan & chunk terenkripsi
                                        ├─ LimiterDO ×16: rate limit di memori
                                        └─ Cron 15 menit: hapus akun hangus
```

```
apps/web           Vite + Svelte 5 SPA (UI, kriptografi client)
apps/relay         Cloudflare Worker + Durable Objects + D1
packages/protocol  Tipe, konstanta, validator, encoding (dipakai web & relay)
packages/crypto    Semua operasi kriptografi client (libsodium)
e2e/               Test end-to-end Playwright (relay lokal sungguhan)
tooling/           Pemeriksa aturan lint, CSP, bundle relay; konfigurasi domain
docs/              Rencana gelombang, keputusan (D-001…), progres, kriteria penerimaan
```

Dokumen acuan: [BLACKCHAT_PRD.md](BLACKCHAT_PRD.md) (spesifikasi) dan [docs/DECISIONS.md](docs/DECISIONS.md) (koreksi & keputusan; menang jika bertentangan dengan PRD).

## Pengembangan lokal

Prasyarat: Node 22 (`.nvmrc`), pnpm 9 lewat corepack (`corepack enable`).

```bash
pnpm install
cp apps/relay/.dev.vars.example apps/relay/.dev.vars   # isi SALT_SECRET: openssl rand -hex 32
pnpm dev            # relay di localhost:8787 (D1 & DO lokal) + web di localhost:5173
```

| Perintah | Isi |
|---|---|
| `pnpm lint` | ESLint + bukti bahwa aturan PRD §12 aktif |
| `pnpm format:check` | Prettier |
| `pnpm typecheck` | TypeScript strict seluruh paket + e2e |
| `pnpm test` | Unit protocol/crypto/web, test relay di workerd, test browser (Chromium), test tooling |
| `pnpm build` | Build web + bundle relay produksi |
| `pnpm check:inline` | HTML build tanpa script/style inline (CSP) |
| `pnpm --filter @blackchat/relay check:bundle` | Bundle relay produksi bebas kode test |
| `pnpm test:e2e` | Playwright: relay lokal tersendiri + build produksi dengan CSP produksi |

Pertama kali: `pnpm exec playwright install chromium`. WebKit opsional: `E2E_WEBKIT=1 pnpm test:e2e` (perlu `pnpm exec playwright install webkit`).

Alur kerja: satu gelombang = satu branch `wN-*` = satu PR; CI wajib hijau sebelum merge (lihat [CLAUDE.md](CLAUDE.md)).

## Deploy

Relay dan web di-deploy terpisah. Langkah di bawah hanya perlu sekali; setelah itu relay ter-deploy otomatis setiap `main` berubah (`deploy-relay.yml`), dan web oleh integrasi Git Vercel.

### 1. Pilih domain

`*.vercel.app` yang sudah dipakai orang tidak bisa diambil (misal `blackchat.vercel.app`). Opsi nama project Vercel (alamat menjadi `https://<nama>.vercel.app`) ada di [docs/PROGRESS.md](docs/PROGRESS.md#opsi-domain). Relay memakai `https://blackchat-relay.<subdomain-akun>.workers.dev`, atau domain sendiri.

### 2. Relay (Cloudflare)

```bash
cd apps/relay
pnpm exec wrangler login
pnpm exec wrangler d1 create blackchat               # salin database_id ke wrangler.toml ([[d1_databases]] tingkat atas)
pnpm exec wrangler secret put SALT_SECRET --env=""   # isi: openssl rand -hex 32
```

Di GitHub → Settings → Secrets and variables → Actions:
- **Secrets:** `CLOUDFLARE_API_TOKEN` (template "Edit Cloudflare Workers" + izin D1 Edit), `CLOUDFLARE_ACCOUNT_ID`.
- **Variables:** `VITE_RELAY_URL` = URL relay (dipakai `release-hash.yml`).

### 3. Hubungkan domain web ↔ relay

```bash
pnpm configure-domains --web https://<nama>.vercel.app --relay https://blackchat-relay.<subdomain>.workers.dev
```

Skrip ini mengisi host relay ke CSP `apps/web/vercel.json` dan `ALLOWED_ORIGIN` di `apps/relay/wrangler.toml`. Commit lewat PR lalu merge: `deploy-relay.yml` menjalankan migrasi D1 produksi dan `wrangler deploy`.

### 4. Web (Vercel)

1. Vercel → Add New Project → import repo ini, **Root Directory `apps/web`**, nama project = nama domain pilihan.
2. Environment Variables (Production): `VITE_RELAY_URL` = URL relay; `ENABLE_EXPERIMENTAL_COREPACK` = `1` (pnpm 9 dari `packageManager`).
3. Settings → Node.js Version **22.x**. Matikan Analytics & Speed Insights. Aktifkan Deployment Protection untuk preview.

### 5. Periksa

Buka web produksi di dua perangkat, register dua akun, kirim teks & gambar, dan pastikan pesan melebur. Rilis dengan hash: `git tag v1.0.0 && git push origin v1.0.0` (lihat SECURITY.md).

## Dependensi

Semua versi dipin persis (`.npmrc` `save-exact=true`). Dependensi baru wajib ditambahkan ke tabel ini beserta alasannya (PRD §12 aturan 14).

### Runtime

| Paket | Dipakai di | Alasan |
|---|---|---|
| `libsodium-wrappers-sumo` | packages/crypto | Semua primitif kripto client. Varian sumo dibutuhkan untuk Argon2id (PRD §2.3). Membawa tipe TypeScript sendiri |
| `@noble/hashes` | apps/relay | BLAKE2b di relay (D-007): WebCrypto tidak punya BLAKE2b, libsodium tidak bisa dimuat di Workers. Diaudit, pure JS |
| `svelte` | apps/web | Framework UI, output statis tanpa inline script (CSP ketat) |
| `qrcode-generator` | apps/web | QR safety number (PRD §4.4). MIT, tanpa dependensi; modul QR digambar sendiri ke canvas (tanpa HTML/SVG string) |

### Pengembangan

| Paket | Alasan |
|---|---|
| `typescript` | Typecheck strict seluruh monorepo |
| `vite`, `@sveltejs/vite-plugin-svelte`, `svelte-check` | Build dan typecheck SPA |
| `@noble/hashes` | Test packages/crypto: pemeriksaan silang Argon2id & BLAKE2b dengan implementasi independen |
| `@types/node` | Tipe Node khusus untuk file test (kode `src` tidak boleh memakai API Node) |
| `vitest` | Test unit semua paket. Dipin di 4.x karena `@cloudflare/vitest-pool-workers` membutuhkan vitest 4 |
| `wrangler`, `@cloudflare/workers-types` | Dev lokal, build, dan deploy relay |
| `@cloudflare/vitest-pool-workers` | Test relay di dalam runtime Workers (workerd) dengan D1 dan Durable Objects lokal |
| `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-svelte`, `svelte-eslint-parser`, `globals` | Lint dengan aturan wajib PRD §12 |
| `prettier`, `prettier-plugin-svelte` | Format kode konsisten |
| `@playwright/test` | Smoke & E2E di browser sungguhan, dengan CSP produksi (`e2e/`) |
| `@vitest/browser-playwright`, `playwright` | Test unit yang butuh browser sungguhan (canvas, encoder gambar): `*.browser.test.ts` di apps/web |

## Atribusi

- Font Instrument Sans dan Martian Mono (SIL Open Font License 1.1), subset Latin dari [Fontsource](https://fontsource.org). Lisensi di `apps/web/public/fonts/`.
- Daftar password umum di `packages/crypto/src/common-passwords.ts` diturunkan dari [SecLists](https://github.com/danielmiessler/SecLists) (MIT, © Daniel Miessler). Lihat D-010.
