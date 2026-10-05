# Deploy BlackChat

Relay (Cloudflare) dan web (Vercel) di-deploy terpisah. Langkah di bawah hanya perlu sekali; setelah itu relay ter-deploy otomatis setiap `main` berubah (`.github/workflows/deploy-relay.yml`), dan web oleh integrasi Git Vercel.

| Bagian | Alamat | Status konfigurasi |
|---|---|---|
| Web | `https://blackchat-id.vercel.app` | Live (Vercel project `blackchat-id`) |
| Relay | `https://blackchat-relay.fachrulanf.workers.dev` | Live; host relay sudah di CSP web |

## 1. Relay (Cloudflare)

Sudah dilakukan: D1 `blackchat` (APAC) dibuat, `database_id` diisi, migrasi diterapkan.

Sisanya lewat browser saja:

1. Cloudflare → **Workers & Pages**: pastikan akun sudah punya subdomain `*.workers.dev` (panel kanan, "Subdomain"). Jika belum, daftarkan satu.
2. GitHub → Settings → Secrets and variables → Actions → **Secrets**:
   - `CLOUDFLARE_API_TOKEN`: token template "Edit Cloudflare Workers" + izin **D1 Edit**.
   - `CLOUDFLARE_ACCOUNT_ID`: Account ID Cloudflare (Workers & Pages → panel kanan).
3. Merge PR yang mengubah `apps/relay/**`, atau GitHub → Actions → **deploy-relay** → **Run workflow**. Workflow menjalankan test relay, migrasi D1, lalu deploy. Pada deploy pertama, `SALT_SECRET` dibuat acak di runner dan langsung dikirim ke Cloudflare (tidak pernah ditampilkan atau disimpan di GitHub). URL relay tampil di log langkah "Deploy Worker".

<details>
<summary>Alternatif lewat terminal</summary>

```bash
cd apps/relay
pnpm exec wrangler login
pnpm exec wrangler d1 migrations apply DB --remote --env=""
pnpm exec wrangler secret put SALT_SECRET --env=""   # isi: openssl rand -hex 32
pnpm exec wrangler deploy --env=""
```

</details>

## 2. Web (Vercel)

1. Vercel → Add New Project → import repo ini. **Project name `blackchat-id`**, **Root Directory `apps/web`**.
2. Environment Variables (Production): `VITE_RELAY_URL` = URL relay; `ENABLE_EXPERIMENTAL_COREPACK` = `1` (pnpm 9 dari `packageManager`).
3. Settings → Node.js Version **22.x**. Matikan Analytics & Speed Insights. Aktifkan Deployment Protection untuk preview.

## 3. Hubungkan web ↔ relay

```bash
pnpm configure-domains --relay https://blackchat-relay.<subdomain>.workers.dev
```

Skrip ini mengisi host relay ke CSP `apps/web/vercel.json` dan mencetak nilai `VITE_RELAY_URL`. Domain web sudah diisi (`--web https://blackchat-id.vercel.app`). Untuk ganti domain web nanti (misal domain sendiri), jalankan ulang dengan `--web https://<domain>`. Commit lewat PR lalu merge.

## 4. Periksa

Buka web produksi di dua perangkat, register dua akun, kirim teks & gambar, dan pastikan pesan melebur. Rilis dengan hash:

```bash
git tag v1.0.0 && git push origin v1.0.0
```

`release-hash.yml` membuat GitHub Release berisi `hashes.txt` (lihat [SECURITY.md](../SECURITY.md#memeriksa-bahwa-yang-disajikan-sama-dengan-kode)).

Checklist keamanan akun & repo (2FA, branch protection, private vulnerability reporting): [PROGRESS.md](PROGRESS.md#checklist-manual-pemilik-proyek-prd-161).
