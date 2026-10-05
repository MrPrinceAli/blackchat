// Semua konstanta protokol BlackChat. Satu-satunya sumber nilai untuk client dan relay.
// Mengubah label atau ukuran di sini memutus kompatibilitas: wajib entri baru di docs/DECISIONS.md.

const KIB = 1024;
const MIB = 1024 * KIB;
const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

export const TIME = {
  SECOND_MS,
  MINUTE_MS,
  HOUR_MS,
} as const;

/**
 * Label domain separation. Setiap label hanya dipakai untuk satu tujuan.
 * Referensi: PRD §4.2–§4.8, §5.2, §6.1, §6.4; D-001, D-003, D-008.
 */
export const LABELS = {
  /** Ed25519(edSk, XPK || xPk) — PRD §4.2. */
  XPK: 'bc-xpk-v1',
  /** authKey = BLAKE2b-256(key=master, AUTH) — PRD §4.3. */
  AUTH: 'bc-auth-v1',
  /** vaultKey = BLAKE2b-256(key=master, VAULT) — PRD §4.3. */
  VAULT: 'bc-vault-v1',
  /** AAD AEAD untuk blob vault {edSk, xSk}. */
  VAULT_BLOB: 'bc-vault-blob-v1',
  /** AAD AEAD untuk blob kontak — PRD §4.8. */
  CONTACTS_BLOB: 'bc-contacts-v1',
  /** Pesan challenge-response WebSocket: Ed25519(edSk, WS_AUTH || userId || nonce) — PRD §6.1, D-008. */
  WS_AUTH: 'bc-ws-auth-v1',
  /** AAD body pesan: MSG || roomId || msgId — PRD §4.5. */
  MSG: 'bc-msg-v1',
  /** AAD chunk gambar: IMG || roomId || msgId || u32(index) — PRD §4.5. */
  IMG: 'bc-img-v1',
  /** Tanda tangan Inner: Ed25519(edSk, INNER || canonical(Inner tanpa sig)) — PRD §4.7. */
  INNER: 'bc-inner-v1',
  /** roomId = BLAKE2b-256(key=shared, ROOM_ID) — PRD §4.6. */
  ROOM_ID: 'bc-room-id-v1',
  /** inboxRoomId_X = BLAKE2b-256(key=shared, INBOX_ROOM || edPk_X) — D-001. */
  INBOX_ROOM: 'bc-inbox-room-v1',
  /** memberKey_X = BLAKE2b-256(key=shared, MEMBER || edPk_X) — PRD §4.6. */
  MEMBER: 'bc-member-v1',
  /** memberTag_X = BLAKE2b-128(key=memberKey_X, TAG) — PRD §4.6. */
  TAG: 'bc-tag-v1',
  /** opHash = BLAKE2b-256(OP || canonical(op tanpa proof)). */
  OP: 'bc-op-v1',
  /** proof = BLAKE2b-256(key=memberKey, PROOF || opNonce || opHash) — PRD §4.6. */
  PROOF: 'bc-proof-v1',
  /** Salt palsu = BLAKE2b-128(key=SALT_SECRET, FAKE_SALT || username) — PRD §5.2. Hanya relay. */
  FAKE_SALT: 'bc-fake-salt-v1',
  /** Kunci limiter per IP = BLAKE2b-256(key=limiterSalt, LIMIT_IP || ip) — PRD §6.4. Hanya relay. */
  LIMIT_IP: 'bc-limit-ip-v1',
  /** Kunci limiter per username = BLAKE2b-256(key=limiterSalt, LIMIT_USER || username) — D-003. Hanya relay. */
  LIMIT_USER: 'bc-limit-user-v1',
  /** Request akun bertanda tangan: Ed25519(edSk, label || canonical(fields)) — PRD §5.2. */
  REQ_REGISTER: 'bc-req-register-v1',
  REQ_CONTACTS: 'bc-req-contacts-v1',
  REQ_PASSWORD: 'bc-req-password-v1',
  REQ_DELETE: 'bc-req-delete-v1',
} as const;

export type Label = (typeof LABELS)[keyof typeof LABELS];

/** Ukuran byte primitif kriptografi (libsodium). */
export const SIZES = {
  ED_PK: 32,
  ED_SK: 64,
  ED_SIG: 64,
  X_PK: 32,
  X_SK: 32,
  /** Output X25519 scalarmult. */
  SHARED: 32,
  AEAD_KEY: 32,
  AEAD_NONCE: 24,
  AEAD_TAG: 16,
  /** crypto_box_SEALBYTES. */
  SEAL_OVERHEAD: 48,
  /** Kunci konten pesan — PRD §4.5. */
  CONTENT_KEY: 32,
  /** BLAKE2b-160(edPk) sebelum base32 — PRD §4.2. */
  USER_ID_HASH: 20,
  /** Panjang userId dalam karakter base32-crockford. */
  USER_ID_CHARS: 32,
  ROOM_ID: 32,
  INBOX_ROOM_ID: 32,
  MEMBER_KEY: 32,
  MEMBER_TAG: 16,
  PROOF: 32,
  OP_HASH: 32,
  OP_NONCE: 16,
  MSG_ID: 16,
  TAB_ID: 16,
  /** Nonce challenge WebSocket dari server. */
  WS_CHALLENGE: 32,
  /** Hash gambar di Inner (BLAKE2b-256). */
  IMAGE_HASH: 32,
  /** Hash authKey yang disimpan server: SHA-256. */
  AUTH_HASH: 32,
  AUTH_KEY: 32,
  VAULT_KEY: 32,
  SAFETY_HASH: 32,
} as const;

/** Format AEAD di wire: nonce(24) || ciphertext || tag(16). */
export const AEAD_OVERHEAD = SIZES.AEAD_NONCE + SIZES.AEAD_TAG;
/** crypto_box_seal atas kunci konten 32 byte. */
export const SEALED_KEY_BYTES = SIZES.SEAL_OVERHEAD + SIZES.CONTENT_KEY;
/** Vault = AEAD(vaultKey, edSk || xSk). */
export const VAULT_BYTES = AEAD_OVERHEAD + SIZES.ED_SK + SIZES.X_SK;

/** Header room tersegel (PRD §6.1): plaintext di-pad ke kelipatan PAD_BLOCK agar panjang username tidak bocor. */
export const HEADER = {
  PAD_BLOCK: 512,
  /** Header yang lebih besar dari satu blok ditolak. */
  SEALED_BYTES: SIZES.SEAL_OVERHEAD + 512,
} as const;

/** Argon2id — D-002 (menggantikan MODERATE di PRD §4.1). */
export const ARGON2 = {
  OPSLIMIT: 3,
  MEMLIMIT: 64 * MIB,
  SALT_BYTES: 16,
  MASTER_BYTES: 64,
} as const;

export const ACCOUNT = {
  USERNAME_PATTERN: /^[a-z0-9_]{3,20}$/,
  USERNAME_MIN: 3,
  USERNAME_MAX: 20,
  PASSWORD_MIN_CHARS: 10,
  /** Umur akun: 72 jam sejak register — PRD §5.3. */
  LIFETIME_MS: 72 * HOUR_MS,
  /** expiresAt publik (lookup, header, room) dibulatkan ke bawah ke kelipatan ini — PRD §5.2, §5.3. */
  EXPIRY_ROUNDING_MS: HOUR_MS,
  /** Peringatan inline AccountClock — PRD §10.3. */
  WARNINGS_MS: [24 * HOUR_MS, HOUR_MS, 5 * MINUTE_MS],
} as const;

export const MESSAGE = {
  /** Pilihan timer lebur (detik) — PRD §1, §4.7. */
  TTL_OPTIONS: [3, 5, 7, 10],
  TEXT_MAX_CHARS: 2000,
  CAPTION_MAX_CHARS: 300,
  /** Padding teks ISO 7816-4 — PRD §4.1. */
  TEXT_PAD_BLOCK: 256,
  /** burn_at = now + ttl*1000 + BURN_GRACE_MS — PRD §6.2. */
  BURN_GRACE_MS: 300,
  /** Durasi efek lebur — PRD §10.4. */
  BURN_ANIMATION_MS: 600,
  BURN_REDUCED_MOTION_MS: 200,
  /** "Dilebur" / "Pesan dibatalkan" hilang setelah ini — PRD §7.1. */
  TOMBSTONE_MS: 3 * SECOND_MS,
  /** Toleransi kriteria penerimaan timer — PRD §15.2. */
  TIMER_TOLERANCE_MS: 500,
  /** Fraksi bubble yang harus terlihat agar dianggap dilihat — PRD §7.2. */
  VIEW_THRESHOLD: 0.5,
  /** Tekan lama untuk menu konteks — PRD §7.4. */
  LONG_PRESS_MS: 500,
  /** Body pesan terenkripsi maksimal: AEAD_OVERHEAD + BODY_MAX_PAD_BLOCKS × TEXT_PAD_BLOCK. */
  BODY_MAX_PAD_BLOCKS: 64,
  /** room.opened membawa paling banyak sekian msgId (client normalnya mengirim satu, PRD §7.2). */
  OPENED_MAX_IDS: 10,
} as const;

export type Ttl = (typeof MESSAGE.TTL_OPTIONS)[number];

export const IMAGE = {
  INPUT_MAX_BYTES: 15 * MIB,
  INPUT_MIME: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  OUTPUT_MIME: ['image/webp', 'image/jpeg'],
  MAX_EDGE_PX: 1600,
  WEBP_QUALITY: 0.8,
  JPEG_QUALITY: 0.85,
  OUTPUT_MAX_BYTES: 1.5 * MIB,
  /** Plaintext gambar di-pad ke kelipatan ini lalu dipecah per CHUNK_BYTES — PRD §4.5. */
  CHUNK_BYTES: 256 * KIB,
  /** Tinggi tampilan maksimal relatif tinggi layar — PRD §7.2. */
  MAX_VIEWPORT_HEIGHT: 0.6,
  /** Upload paralel maksimal — PRD §13.2. */
  UPLOAD_CONCURRENCY: 2,
} as const;

/** Chunk terenkripsi = nonce + CHUNK_BYTES + tag AEAD. Semua chunk identik ukurannya (PRD §4.5). */
export const IMAGE_CIPHER_CHUNK_BYTES = AEAD_OVERHEAD + IMAGE.CHUNK_BYTES;
/** sodium_pad selalu menambah ≥ 1 byte, jadi gambar OUTPUT_MAX_BYTES bisa butuh satu chunk tambahan. */
export const IMAGE_MAX_CHUNKS = Math.ceil((IMAGE.OUTPUT_MAX_BYTES + 1) / IMAGE.CHUNK_BYTES);

export const CONTACTS = {
  /** Blob kontak di-pad ke kelipatan 4 KB — PRD §4.8. */
  PAD_BLOCK: 4 * KIB,
  /** Blob kontak maksimal 8 blok (32 KiB plaintext). */
  MAX_PAD_BLOCKS: 8,
} as const;

export const LIMITS = {
  /** Frame biner chunk maksimal — PRD §13.2. */
  CHUNK_FRAME_MAX_BYTES: 300 * KIB,
  /** Pesan tertunda per room — PRD §6.2. */
  ROOM_MAX_PENDING_MESSAGES: 200,
  ROOM_MAX_CHUNK_BYTES: 30 * MIB,
  /** Total chunk yang boleh diunggah satu akun selama umurnya — PRD §6.1. */
  ACCOUNT_UPLOAD_QUOTA_BYTES: 150 * MIB,
  /** Upload gambar yang tidak lengkap dihapus setelah ini — PRD §6.2. */
  UPLOAD_DEADLINE_MS: 10 * MINUTE_MS,
  /** opNonce yang sudah dipakai ditolak selama jendela ini — PRD §4.6. */
  NONCE_WINDOW_MS: 10 * MINUTE_MS,
  /** Batas ukuran body HTTP akun (vault + kontak + overhead). */
  HTTP_BODY_MAX_BYTES: 64 * KIB,
  /** Batas ukuran frame WS JSON. */
  WS_JSON_FRAME_MAX_BYTES: 64 * KIB,
  /** Entri room maksimal di satu InboxDO (membatasi storage yang bisa diisi pihak lain lewat touch). */
  INBOX_MAX_ROOMS: 1000,
  /** Socket yang belum lolos challenge maksimal per InboxDO; yang tertua ditutup. */
  INBOX_MAX_PENDING_SOCKETS: 4,
} as const;

/** Rate limit — PRD §6.4, D-003. */
export const RATE_LIMITS = {
  REGISTER_PER_IP: { limit: 3, windowMs: HOUR_MS },
  LOGIN_PER_IP: { limit: 10, windowMs: 10 * MINUTE_MS },
  LOOKUP_PER_IP: { limit: 30, windowMs: MINUTE_MS },
  SEND_PER_ACCOUNT: { limit: 30, windowMs: MINUTE_MS },
  CHUNK_PER_ACCOUNT: { limit: 60, windowMs: MINUTE_MS },
  /** Gagal login ke-n ≥ FREE_FAILURES → jeda BASE_MS × 2^(n − FREE_FAILURES), maks MAX_MS. */
  LOGIN_FAILURES: { FREE_FAILURES: 5, BASE_MS: 30 * SECOND_MS, MAX_MS: 15 * MINUTE_MS },
  /** Jumlah instance LimiterDO (limiter:0 … limiter:f). */
  LIMITER_SHARDS: 16,
} as const;

/** Sesi browser — PRD §5.4. */
export const SESSION = {
  IDLE_LOCK_MS: 10 * MINUTE_MS,
  WARNING_BEFORE_LOCK_MS: 60 * SECOND_MS,
  ACTIVITY_THROTTLE_MS: 15 * SECOND_MS,
  CHECK_INTERVAL_MS: 15 * SECOND_MS,
  AES_GCM_IV_BYTES: 12,
  STORAGE_KEYS: { TAB: 'bc.tab', SESSION: 'bc.sess', VIEW: 'bc.view' },
  IDB_NAME: 'blackchat',
  IDB_STORE: 'sessions',
  BROADCAST_CHANNEL: 'bc-tab',
  ACTIVITY_EVENTS: ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'],
} as const;

/** WebSocket — PRD §13.1. */
export const WS = {
  HEARTBEAT_MS: 25 * SECOND_MS,
  RECONNECT_BASE_MS: 500,
  RECONNECT_MAX_MS: 10 * SECOND_MS,
  PING: '{"t":"ping"}',
  PONG: '{"t":"pong"}',
  /** Kode tutup socket. */
  CLOSE: {
    /** Socket lain untuk akun yang sama dibuka — PRD §6.1. */
    REPLACED: 4409,
    UNAUTHORIZED: 4401,
    EXPIRED: 4410,
    PROTOCOL_ERROR: 4400,
  },
} as const;

/** Frame biner upload chunk — PRD §13.2. */
export const BINARY_FRAME = {
  TYPE_CHUNK: 0x01,
  /** [tipe 1][msgId 16][idx 4][panjang header 2] */
  PREFIX_BYTES: 1 + SIZES.MSG_ID + 4 + 2,
  /** Header JSON {reqId, op, auth, rute lawan, header tersegel} maksimal (D-018). */
  HEADER_MAX_BYTES: 2048,
} as const;

/** reqId frame WS: bilangan bulat 1 … 2^31 − 1. */
export const REQ_ID_MAX = 2 ** 31 - 1;

/** Kode error yang dikirim relay ke client. */
export const ERRORS = {
  INVALID: 'invalid',
  UNAUTHORIZED: 'unauthorized',
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  RATE_LIMITED: 'rate_limited',
  ROOM_FULL: 'room_full',
  QUOTA_EXCEEDED: 'quota_exceeded',
  BAD_PROOF: 'bad_proof',
  REPLAY: 'replay',
  FORBIDDEN: 'forbidden',
  EXPIRED: 'expired',
  INTERNAL: 'internal',
} as const;

export type ErrorCode = (typeof ERRORS)[keyof typeof ERRORS];
