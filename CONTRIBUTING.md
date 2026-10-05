# Berkontribusi ke blackchat

Terima kasih sudah mau membantu. blackchat adalah aplikasi keamanan, jadi standarnya ketat: setiap perubahan harus menjaga **Aturan Emas** di [CLAUDE.md](CLAUDE.md) (ringkasan PRD §12).

## Celah keamanan

**Jangan buka issue publik.** Laporkan lewat GitHub → Security → *Report a vulnerability*. Lihat [SECURITY.md](SECURITY.md).

## Alur kerja

1. Satu perubahan = satu branch = satu PR ke `main`. CI wajib hijau sebelum merge.
2. Spesifikasi ada di [BLACKCHAT_PRD.md](BLACKCHAT_PRD.md); koreksinya di [docs/DECISIONS.md](docs/DECISIONS.md) (menang jika bertentangan). Keputusan desain baru dicatat sebagai entri `D-xxx`.
3. Jalankan gerbang lokal sebelum push:

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm check:inline
pnpm --filter @blackchat/relay check:bundle
pnpm test:e2e
```

## Aturan singkat

- Server tidak pernah menerima plaintext dan tidak menyimpan relasi antar-akun, IP, atau waktu login.
- Tidak menulis algoritma kripto sendiri: client lewat `packages/crypto` (libsodium), relay lewat WebCrypto + `@noble/hashes` (BLAKE2b).
- Dilarang `console.*`, `innerHTML`, `{@html}`, `eval` (ditegakkan lint).
- Semua input jaringan divalidasi di `packages/protocol/src/validate.ts`.
- Setiap fungsi crypto, validator, dan operasi relay wajib punya test, termasuk test negatif.
- Teks UI Bahasa Indonesia, sentence case, semua string di `apps/web/src/lib/strings.ts`.
- Dependensi baru wajib dipin persis dan dicatat alasannya di [README.md](README.md#-dependensi).
- Perubahan tampilan: perbarui gambar README dengan `pnpm readme:assets`.
