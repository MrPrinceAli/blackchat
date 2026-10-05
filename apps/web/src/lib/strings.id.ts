// Teks UI Bahasa Indonesia (sentence case). Sumber: PRD §5.4, §10.3, §10.6. Bahasa Inggris: strings.en.ts (D-024).
// Teks yang memuat nilai berupa fungsi; tidak ada HTML di sini (dirender sebagai text node).

const at = (username: string): string => `@${username}`;

export const id = {
  appName: 'blackchat',

  language: {
    label: 'Bahasa',
    en: 'English',
    id: 'Bahasa Indonesia',
  },

  welcome: {
    taglineMessages: 'Pesan yang melebur setelah dibaca.',
    taglineAccount: 'Akun yang hangus dalam 3 hari.',
    createAccount: 'Buat akun',
    signIn: 'Masuk',
    incognitoHint: 'Untuk privasi terbaik, buka di mode incognito tanpa ekstensi.',
    eyebrow: 'arsip rahasia · end-to-end',
    edition: 'e2ee · tanpa log',
    specs: ['lebur 3–10 dtk', 'hangus 72 jam', 'tanpa email', 'nol plaintext di server'],
    preview: {
      label: 'pratinjau',
      peer: '@rara',
      message: 'jam 8 di tempat biasa',
      reply: 'oke, aku datang',
      watermark: 'PRATINJAU',
      footer: 'Kunci hanya ada di perangkat ini.',
    },
    stack: [
      { name: 'x25519', role: 'pertukaran kunci' },
      { name: 'ed25519', role: 'tanda tangan' },
      { name: 'xchacha20-poly1305', role: 'enkripsi pesan' },
      { name: 'argon2id', role: 'kunci dari password' },
    ],
    stackLabel: 'kriptografi yang dipakai',
  },

  register: {
    title: 'Buat akun',
    subtitle: 'Cukup username dan password. Tanpa email, tanpa nomor HP.',
    haveAccount: 'Sudah punya akun?',
    toLogin: 'Masuk di sini',
    strength: (level: number) =>
      ['Terlalu pendek, minimal 10 karakter.', 'Cukup.', 'Kuat.', 'Sangat kuat.'][level] ?? '',
    username: 'Username',
    usernameHint: 'Huruf kecil, angka, atau garis bawah. 3–20 karakter.',
    available: 'Tersedia',
    taken: 'Sudah dipakai',
    password: 'Password',
    passwordHint: 'Minimal 10 karakter.',
    repeatPassword: 'Ulangi password',
    submit: 'Buat akun',
    securing: 'Mengamankan akun...',
    warning:
      'Tidak ada pemulihan password. Akun dan semua pesan hangus otomatis 3 hari setelah dibuat.',
    errors: {
      usernameFormat: 'Username hanya boleh huruf kecil, angka, dan garis bawah (3–20 karakter).',
      tooShort: 'Password minimal 10 karakter.',
      sameAsUsername: 'Password tidak boleh sama dengan username.',
      common: 'Password ini terlalu umum. Pilih yang lain.',
      mismatch: 'Password tidak sama.',
      taken: 'Username sudah dipakai.',
      rateLimited: 'Terlalu banyak percobaan. Coba lagi nanti.',
      generic: 'Gagal membuat akun. Coba lagi.',
    },
  },

  login: {
    title: 'Masuk',
    subtitle: 'Kunci akun dibuka di perangkat ini. Password tidak pernah dikirim.',
    noAccount: 'Belum punya akun?',
    toRegister: 'Buat sekarang',
    username: 'Username',
    password: 'Password',
    submit: 'Masuk',
    working: 'Membuka akun...',
    error: 'Username atau password salah.',
    rateLimited: (seconds: number) => `Terlalu banyak percobaan. Coba lagi dalam ${seconds} detik.`,
  },

  home: {
    searchPlaceholder: 'Cari username...',
    searchLabel: 'Cari username',
    search: 'Cari',
    start: 'Mulai percakapan',
    settings: 'Pengaturan',
    empty: 'Belum ada percakapan. Cari username untuk mulai.',
    unread: (n: number) => `${n} belum dibuka`,
    chooseTimer: 'Pilih timer lebur',
    self: 'Itu username kamu sendiri.',
    invalidPeer: 'Kunci akun ini tidak valid. Percakapan tidak bisa dimulai.',
    startFailed: 'Gagal memulai percakapan. Coba lagi.',
    loading: 'Memuat percakapan...',
    signedInAs: 'masuk sebagai',
    expiresIn: 'hangus dalam',
    conversations: 'percakapan',
  },

  pane: {
    title: 'Pilih percakapan',
    body: 'Buka percakapan di daftar kiri, atau cari username untuk mulai. Setiap pesan melebur setelah dibaca.',
    eyebrow: 'terenkripsi end-to-end · tanpa jejak',
    shortcuts: [
      ['Enter', 'kirim pesan'],
      ['Shift + Enter', 'baris baru'],
      ['Shift + F10', 'menu pesan sendiri'],
      ['Esc', 'tutup menu'],
    ] as [string, string][],
  },

  timer: {
    seconds: (ttl: number) => `${ttl} dtk`,
    label: (ttl: number) => `${ttl} detik`,
    propose: 'Usulkan timer baru',
    proposal: (username: string, ttl: number) =>
      `${at(username)} ingin mengubah timer ke ${ttl} detik.`,
    accept: 'Setuju',
    reject: 'Tolak',
    waiting: (ttl: number) => `Menunggu persetujuan timer ${ttl} detik.`,
    simultaneous: (ttl: number) => `Kalian memulai bersamaan. Timer yang berlaku ${ttl} detik.`,
    changed: (ttl: number) => `Timer sekarang ${ttl} detik.`,
    rejected: 'Usulan timer ditolak.',
    submit: 'Usulkan',
    cancel: 'Batal',
  },

  chat: {
    statusEncrypted: 'terenkripsi end-to-end',
    statusVerified: 'kunci terverifikasi',
    e2eNote: (ttl: number) => `Terenkripsi end-to-end · melebur ${ttl} dtk setelah dibaca`,
    back: 'Kembali',
    verify: 'Verifikasi',
    menu: 'Menu percakapan',
    block: (username: string) => `Blokir ${at(username)}`,
    blockAction: 'Blokir',
    cancel: 'Batal',
    verified: 'Terverifikasi',
    blockConfirm: (username: string) =>
      `Blokir ${at(username)}? Semua pesan di percakapan ini dihapus dan pesan berikutnya dari akun ini tidak akan ditampilkan.`,
    composerPlaceholder: 'Tulis pesan...',
    composerLabel: 'Tulis pesan',
    attach: 'Lampirkan gambar',
    send: 'Kirim',
    notOpened: 'Belum dibuka',
    queued: 'Menunggu giliran',
    burned: 'Dilebur',
    retracted: 'Pesan dibatalkan',
    sending: 'Mengirim...',
    uploading: (done: number, total: number) => `Mengirim gambar ${done}/${total}`,
    imageFailed: 'Gambar tidak bisa ditampilkan.',
    secondsLeft: (s: number) => `${s} detik tersisa`,
    retract: 'Batalkan pesan',
    retractSeen: 'Sudah dilihat. Pesan tetap dihapus dari kedua sisi.',
    imageAlt: 'Gambar rahasia',
    sendFailed: 'Pesan gagal dikirim. Coba lagi.',
    blockSoon: 'Blokir tersedia segera.',
  },

  verify: {
    title: 'Verifikasi',
    description: (username: string) =>
      `Bandingkan angka ini dengan ${at(username)} secara langsung. Jika sama, tidak ada yang menyadap percakapan kalian.`,
    mark: 'Tandai terverifikasi',
    verified: 'Terverifikasi',
    numberLabel: 'safety number · 60 digit',
    qrLabel: (username: string) => `atau pindai dari perangkat ${at(username)}`,
  },

  settings: {
    title: 'Pengaturan',
    theme: 'Tema',
    themeSystem: 'Ikuti sistem',
    themeDark: 'Gelap',
    themeLight: 'Terang',
    changePassword: 'Ganti password',
    signOut: 'Keluar',
    deleteNow: 'Hapus akun sekarang',
    deleteConfirm: (username: string) =>
      `Ketik ${username} untuk menghapus akun ini beserta semua pesannya.`,
    deleting: 'Menghapus percakapan...',
    deleteFailed: 'Gagal menghapus akun. Coba lagi.',
    currentPassword: 'Password sekarang',
    newPassword: 'Password baru',
    wrongPassword: 'Password sekarang salah.',
    passwordChanged: 'Password diganti.',
    sectionDisplay: 'tampilan',
    sectionLanguage: 'bahasa',
    sectionAccount: 'akun',
    sectionDanger: 'zona bahaya',
    dangerNote: 'Semua percakapan dihapus dari server. Tidak bisa dibatalkan.',
  },

  expired: {
    message: 'Akun ini telah hangus. Semua pesan sudah dihapus.',
    createNew: 'Buat akun baru',
    eyebrow: 'umur akun habis · 72 jam',
  },

  account: {
    clockLabel: 'Sisa umur akun',
    warning: (span: string) => `Akun hangus dalam ${span}. Semua pesan ikut terhapus.`,
    spans: { day: '24 jam', hour: '1 jam', fiveMinutes: '5 menit' },
    /** Satuan jam umur akun: hari, jam, menit, detik (`2h 14j 03m`). */
    units: { day: 'h', hour: 'j', minute: 'm', second: 'd' },
  },

  session: {
    lockWarning: 'Sesi akan dikunci dalam 60 detik karena tidak ada aktivitas.',
    stay: 'Tetap masuk',
    otherTab: 'Akun ini sedang dibuka di tab lain.',
    useHere: 'Gunakan di sini',
    reconnecting: 'Menyambung ulang...',
    locked: 'Sesi dikunci karena tidak ada aktivitas. Masuk lagi untuk melanjutkan.',
  },

  errors: {
    usernameNotFound: 'Username tidak ditemukan. Mungkin sudah hangus.',
    keyChanged: (username: string) =>
      `${at(username)} sekarang memakai kunci berbeda. Ini bisa jadi akun baru dengan username yang sama.`,
    roomFull: 'Terlalu banyak pesan belum dibuka di percakapan ini.',
    imageTooLarge: 'Gambar maksimal 15 MB.',
    imageUnreadable: 'Gambar tidak bisa dibaca.',
    captionTooLong: 'Caption maksimal 300 karakter.',
    peerGone: (username: string) => `Akun ${at(username)} sudah tidak ada.`,
    quotaExceeded: 'Batas kirim gambar untuk akun ini sudah tercapai.',
  },
};

export type Strings = typeof id;
