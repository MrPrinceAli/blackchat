# Keamanan BlackChat

BlackChat adalah chat satu-lawan-satu dengan enkripsi end-to-end. Pesan melebur beberapa detik setelah dilihat, dan akun hangus 72 jam setelah dibuat. Dokumen ini menjelaskan apa yang dilindungi, apa yang **tidak**, dan cara melaporkan masalah.

## Melaporkan kerentanan

Jangan membuka issue publik. Gunakan **GitHub → Security → Report a vulnerability** (private vulnerability reporting) di repositori ini. Sertakan langkah reproduksi dan dampaknya. Kami menanggapi secepatnya dan memberi kredit jika diinginkan.

## Ringkasan desain

- **Kunci hanya di browser.** Identitas (Ed25519 + X25519) dibuat di browser. Kunci rahasia disimpan di server hanya dalam bentuk vault terenkripsi dengan kunci turunan password (Argon2id 64 MiB, t=3; D-002). Server menerima `authKey` dan hanya menyimpan SHA-256-nya.
- **Isi tidak pernah terbaca server.** Pesan, gambar, caption, blob kontak, dan header percakapan semuanya ciphertext (XChaCha20-Poly1305, sealed box X25519). Pesan teks di-pad ke kelipatan 256 byte, chunk gambar berukuran identik, blob kontak kelipatan 4 KB, dan header percakapan selalu 560 byte.
- **Server tidak menyimpan siapa bicara dengan siapa.** Nama room diturunkan dari rahasia Diffie-Hellman. RoomDO hanya menyimpan tag & kunci anggota (bukan identitas). Setiap inbox menyimpan ID room yang berbeda (D-001), sehingga storage beberapa inbox tidak bisa dicocokkan satu sama lain.
- **Umur data terbatas.** Pesan dihapus server pada `burn_at`, dibatalkan, atau saat room hangus (dibulatkan ke bawah ke jam penuh, tidak pernah melewati umur akun mana pun). Akun dihapus saat hangus oleh pemeriksaan per request, alarm Durable Object, dan cron 15 menit.
- **Aturan kode** (PRD §12) ditegakkan lint dan CI: tidak ada HTML mentah, tidak ada `console`, storage browser hanya di dua modul, CSP ketat tanpa inline script/style.

## Model ancaman (PRD §14, status terbaru)

| # | Risiko | Status | Mitigasi |
|---|---|---|---|
| 1 | Akun GitHub/Vercel/Cloudflare diretas | Dikurangi | 2FA (langkah manual), action dipin ke SHA, Dependabot, hash rilis |
| 2 | Supply chain npm | Dikurangi | Dependensi minimal & dipin persis, alasan tiap dependensi di README, `pnpm install --frozen-lockfile` |
| 3 | XSS lewat pesan | **Dicegah** | Teks selalu text node; `innerHTML`/`{@html}`/`eval` dilarang lint; CSP `script-src 'self'`; diuji E2E |
| 4 | MITM penukaran kunci | **Dicegah jika diverifikasi** | Safety number 60 digit + QR; peringatan jika kunci lawan berubah (blob kontak) |
| 5 | Username lama dipakai orang lain setelah hangus | Dikurangi | Peringatan "kunci berbeda"; room lama dilupakan |
| 6 | Brute force password online | **Dicegah** | Rate limit per IP + jeda per username yang berlipat (maks 15 menit; D-003, D-012) |
| 7 | Brute force password jika database bocor | Dikurangi | Argon2id 64 MiB per tebakan; password ≥ 10 karakter, bukan password umum. Parameter lebih ringan dari PRD (D-002) agar jalan di HP |
| 8 | Enumerasi username lewat login | Dikurangi | Salt palsu deterministik & pesan error umum. Catatan: pendaftaran dan pencarian username memang menunjukkan apakah username dipakai (dibutuhkan untuk memulai percakapan) |
| 9 | Orang asing membaca/mengubah room | **Dicegah** | Bukti keanggotaan per operasi (MAC dengan kunci anggota) |
| 10 | Replay operasi room | **Dicegah** | `opNonce` sekali pakai dalam 10 menit |
| 11 | Server menyimpan relasi antar-akun | **Dicegah** | Room tanpa identitas, header tersegel, ID room berbeda per inbox (D-001); diuji dengan memeriksa isi storage |
| 12 | Server melihat relasi saat pesan diproses (sesaat) | **Diterima** | Tidak disimpan; observability Worker dimatikan |
| 13 | Kunci bocor sebelum hangus → pesan yang masih tersimpan terbaca | Dikurangi | Pesan dihapus saat lebur; tanpa forward secrecy per pesan (Double Ratchet = pengembangan lanjutan) |
| 14 | Metadata EXIF/GPS di gambar | **Dicegah** | Gambar digambar ulang lewat canvas sebelum dienkripsi; diuji di browser sungguhan |
| 15 | Screenshot / foto layar | Dikurangi | Layar dihitamkan saat jendela tidak fokus, salin/print diblok, watermark samar; tidak bisa mencegah kamera lain |
| 16 | Client dimodifikasi menyimpan pesan | **Diterima** | Batasan desain: penerima yang curang selalu bisa menyalin apa yang ia lihat |
| 17 | Pesan sudah dilihat lalu dibatalkan | **Diterima** | Menu memberi keterangan "Sudah dilihat…" |
| 18 | Storage gratis penuh | Dikurangi | Maks 200 pesan & 30 MB per room, 150 MB per akun, upload terputus disapu 10 menit, umur 3 hari |
| 19 | Pesan tidak terhapus jika client offline | **Dicegah** | Alarm RoomDO di server |
| 20 | Akun tidak terhapus tepat waktu | **Dicegah** | Pemeriksaan per request + alarm InboxDO + cron |
| 21 | Perbedaan jam perangkat | **Dicegah** | Server mengirim sisa waktu (`remainingMs`), bukan timestamp |
| 22 | Kuota gratis habis | Dikurangi | WebSocket hibernasi, rate limit |
| 23 | Plaintext tersisa di memori JS | Dikurangi | Buffer di-wipe; string JS tidak bisa dijamin terhapus (batasan bahasa) |
| 24 | Password lupa | **Diterima** | Tidak ada pemulihan; dijelaskan saat register |
| 25 | Kunci sesi tersimpan di browser (tahan refresh) | **Diterima** | Terenkripsi dengan kunci AES non-extractable, terikat satu tab, hangus setelah 10 menit tidak aktif. Penyerang dengan akses fisik ke profil browser dalam rentang itu masih berpotensi memulihkannya |
| 26 | Sesi tertinggal di perangkat yang ditinggal | **Dicegah** | Kunci otomatis 10 menit, termasuk saat tab tersembunyi |
| 27 | Ukuran gambar terenkripsi membocorkan isi | **Dicegah** | Padding ke kelipatan 256 KB, semua chunk identik. Jumlah chunk (1–7) tetap terlihat server |
| 28 | Ukuran blob kontak membocorkan jumlah kontak | **Dicegah** | Padding 4 KB |
| 29 | Server mencatat waktu aktivitas percakapan | **Dicegah** | Tanpa kolom waktu di inbox |
| 30 | Server tahu jenis pesan | Dikurangi | Tanpa kolom jenis; server hanya tahu ada/tidaknya chunk |
| 31 | Waktu register terlihat lewat lookup | **Dicegah** | `expiresAt` publik dibulatkan ke jam |
| 32 | Waktu hangus room dicocokkan dengan D1 | **Dicegah** | `expire_at` room dibulatkan ke jam |
| 33 | Hapus akun tidak menghapus pesan tertunda | **Dicegah** | Purge setiap room sebelum akun dihapus |
| 34 | InboxDO akun hangus hidup kembali | **Dicegah** | Tidak ada penulisan storage sebelum akun terbukti hidup |
| 35 | Dua percakapan dengan username sama | **Dicegah** | Penyaringan daftar + lookup saat membuka room |
| 36 | Pesan menumpuk melebur sebelum terbaca | **Dicegah** | Lebur berurutan, satu pesan terdepan |
| 37 | Gambar tinggi tidak pernah memicu timer | **Dicegah** | Tinggi tampilan ≤ 60% layar |

## Batasan & risiko tambahan yang diterima

- **Routing notifikasi tidak bisa diverifikasi server (D-013).** Karena server sengaja tidak tahu siapa lawan bicara, anggota sebuah room bisa mengarahkan notifikasi ke inbox mana pun yang ia sebut. Dampaknya: penghitung "belum dibuka" atau event palsu, dan entri sampah di daftar percakapan korban (maks 1000, dibatasi 30 kirim/menit). Isi pesan tetap aman. Client menyaring entri yang header-nya tidak cocok dengan kuncinya dan mengabaikan event untuk room yang tidak dikenal (D-016).
- **Penguncian username (D-003).** Penyerang bisa sengaja gagal login 5× agar sebuah username terkunci sementara (maks 15 menit). Jeda per username ini diperlukan untuk menahan brute force.
- **Ganti password tidak atomik (D-019).** Vault diperbarui lebih dulu, lalu blob kontak dienkripsi ulang. Jika koneksi putus di antara keduanya, daftar kontak (status terverifikasi & blokir) hilang; akun dan pesan tidak terpengaruh.
- **Penerima yang curang** bisa menyalin isi pesan (screenshot, client yang dimodifikasi). Lebur melindungi dari pembacaan *setelah* waktunya, bukan dari penerima itu sendiri.
- **Ekstensi browser** bisa membaca halaman. Gunakan mode incognito tanpa ekstensi (disarankan di layar awal).

## Memeriksa bahwa yang disajikan sama dengan kode

Setiap tag `v*` membuat GitHub Release berisi `hashes.txt`: SHA-384 seluruh file web hasil build dari tag itu (`.github/workflows/release-hash.yml`). Untuk memeriksa file yang disajikan produksi:

```bash
curl -s https://<domain-web>/assets/<nama-file>.js | openssl dgst -sha384 -binary | openssl base64 -A
# bandingkan dengan baris yang sama di hashes.txt (format: sha384-<base64>  assets/<nama-file>.js)
```

Nama file aset berisi hash konten (Vite), jadi daftar file di `index.html` produksi juga harus sama dengan `hashes.txt`.
