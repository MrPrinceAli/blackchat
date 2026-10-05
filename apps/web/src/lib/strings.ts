// Semua teks UI (Bahasa Indonesia, sentence case). Sumber: PRD §5.4, §10.3, §10.6.
// Teks yang memuat nilai berupa fungsi; tidak ada HTML di sini (dirender sebagai text node).

const at = (username: string): string => `@${username}`;

export const strings = {
  appName: 'blackchat',

  welcome: {
    taglineMessages: 'Pesan yang melebur setelah dibaca.',
    taglineAccount: 'Akun yang hangus dalam 3 hari.',
    createAccount: 'Buat akun',
    signIn: 'Masuk',
    incognitoHint: 'Untuk privasi terbaik, buka di mode incognito tanpa ekstensi.',
  },

  register: {
    title: 'Buat akun',
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
    back: 'Kembali',
    verify: 'Verifikasi',
    menu: 'Menu percakapan',
    block: (username: string) => `Blokir ${at(username)}`,
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
  },

  expired: {
    message: 'Akun ini telah hangus. Semua pesan sudah dihapus.',
    createNew: 'Buat akun baru',
  },

  account: {
    clockLabel: 'Sisa umur akun',
    warning: (span: string) => `Akun hangus dalam ${span}. Semua pesan ikut terhapus.`,
    spans: { day: '24 jam', hour: '1 jam', fiveMinutes: '5 menit' },
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
    peerGone: (username: string) => `Akun ${at(username)} sudah tidak ada.`,
    quotaExceeded: 'Batas kirim gambar untuk akun ini sudah tercapai.',
  },
} as const;
