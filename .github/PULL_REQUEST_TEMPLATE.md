## Ringkasan

<!-- Apa yang berubah dan kenapa. Rujuk PRD §N / D-xxx jika relevan. -->

## Checklist

- [ ] Aturan Emas (CLAUDE.md) tetap terjaga: tidak ada plaintext/relasi baru di server
- [ ] Test ditambahkan/diperbarui (termasuk test negatif)
- [ ] `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm check:inline` lulus
- [ ] `pnpm test:e2e` lulus
- [ ] Keputusan baru dicatat di docs/DECISIONS.md; dependensi baru dicatat di README.md
- [ ] Perubahan tampilan: gambar README diperbarui (`pnpm readme:assets`)
