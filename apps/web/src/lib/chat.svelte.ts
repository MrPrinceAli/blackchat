// Daftar percakapan, room yang terbuka, dan pesan (PRD §4.5–§4.7, §6.3, §7, §8).
// Semua yang ditampilkan berasal dari data terenkripsi relay yang didekripsi & diverifikasi di sini.
// Kunci room (shared, memberKey) dan plaintext hanya di memori; di-wipe saat sesi berakhir (PRD §5.4, §7.6).
import {
  ACCOUNT,
  base64urlDecode,
  base64urlEncode,
  LIMITS,
  type EventFrame,
  type InitOp,
  type LookupResponse,
  type RoomHeader,
  type SyncedMessage,
  type Ttl,
} from '@blackchat/protocol';
import type { RoomKeys } from '@blackchat/crypto';
import {
  activeSession,
  onRelayEvent,
  onSessionEnd,
  onSessionReady,
  rememberView,
  type ActiveSession,
} from './account';
import { RelayError, relayApi } from './relay-api';
import { navigate } from './router.svelte';
import { strings } from './strings';
import { RequestError } from './ws';

// ================================================================ state

export interface RoomEntry {
  /** inboxRoomId milik sendiri (D-001). */
  inboxRoomId: string;
  peer: RoomHeader;
  unread: number;
  /** Naik saat ada pesan baru selama sesi ini (urutan hanya di memori, PRD §8). */
  bump: number;
}

export type MessageStatus = 'sending' | 'delivered' | 'opened';

export interface ChatMessage {
  msgId: string;
  seq: number;
  mine: boolean;
  ttl: Ttl;
  /** Plaintext; di-null-kan saat lebur (PRD §7.6). */
  text: string | null;
  status: MessageStatus;
  /** Sisa waktu lebur saat `remainingAt` (ms, dari server; PRD §13.3). */
  remainingMs?: number;
}

export interface OpenRoom {
  entry: RoomEntry;
  keys: RoomKeys;
  ttl: Ttl;
  /** Header tentang diri sendiri yang disegel ke lawan; ikut dikirim agar room muncul lagi jika lawan melupakannya. */
  headerForPeer: string;
}

export const chat = $state<{
  rooms: RoomEntry[];
  loading: boolean;
  /** Pemberitahuan di Home (misal lawan sudah tidak ada). */
  notice: string | null;
  open: OpenRoom | null;
  messages: ChatMessage[];
  /** Pemberitahuan di Chat (misal "Kalian memulai bersamaan"). */
  chatNotice: string | null;
}>({ rooms: [], loading: false, notice: null, open: null, messages: [], chatNotice: null });

/** Urutan daftar: yang baru menerima pesan di sesi ini, lalu yang belum dibuka, lalu alfabetis (PRD §8). */
export function sortedRooms(list: RoomEntry[]): RoomEntry[] {
  return [...list].sort(
    (a, b) =>
      b.bump - a.bump ||
      Number(b.unread > 0) - Number(a.unread > 0) ||
      a.peer.peerUsername.localeCompare(b.peer.peerUsername),
  );
}

/**
 * Antrean lebur berurutan (PRD §7.2): pesan masuk diurutkan menurut seq; hanya yang terdepan ditampilkan.
 * Mengembalikan msgId pesan masuk terdepan (atau null).
 */
export function queueFront(messages: ChatMessage[]): string | null {
  let front: ChatMessage | null = null;
  for (const m of messages) if (!m.mine && (!front || m.seq < front.seq)) front = m;
  return front?.msgId ?? null;
}

// ================================================================ util

// Sengaja tidak reaktif: kunci rahasia room tidak boleh menjadi state yang dipantau UI.
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const keyCache = new Map<string, RoomKeys>();
let bumpCounter = 0;
/** msgId yang gagal didekripsi/diverifikasi: tidak dicoba ulang, tidak ditampilkan. */
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- cache internal, tidak ditampilkan
const rejected = new Set<string>();

function requireSession(): ActiveSession {
  const s = activeSession();
  if (!s) throw new Error('tidak ada sesi aktif');
  return s;
}

const floorHour = (t: number): number => t - (t % ACCOUNT.EXPIRY_ROUNDING_MS);

function deriveKeys(s: ActiveSession, peer: Pick<RoomHeader, 'peerXPk' | 'peerEdPk'>): RoomKeys {
  return s.crypto.deriveRoom(
    s.identity.xSk,
    base64urlDecode(peer.peerXPk),
    s.identity.edPk,
    base64urlDecode(peer.peerEdPk),
  );
}

function headerAboutMe(s: ActiveSession): RoomHeader {
  return {
    v: 1,
    peerUserId: s.userId,
    peerUsername: s.username,
    peerEdPk: base64urlEncode(s.identity.edPk),
    peerXPk: base64urlEncode(s.identity.xPk),
    peerXPkSig: base64urlEncode(s.identity.xPkSig),
    peerExpiresAt: floorHour(s.expiresAtLocal),
  };
}

function wipeKeys(): void {
  const s = activeSession();
  for (const keys of keyCache.values()) s?.crypto.wipeRoomKeys(keys);
  keyCache.clear();
}

// ================================================================ daftar room

/**
 * Muat daftar room (PRD §8): buka setiap header tersegel, lalu buang entri yang tidak sah —
 * header gagal dibuka, inboxRoomId tidak cocok dengan kunci yang diturunkan dari header (entri palsu, D-013),
 * atau lawan sudah hangus. Entri yang dibuang di-`rooms.forget` di relay.
 */
export async function loadRooms(): Promise<void> {
  const s = requireSession();
  chat.loading = true;
  try {
    const { rooms } = await s.connection.request({ t: 'rooms' });
    const now = Date.now();
    const kept: RoomEntry[] = [];
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- variabel lokal
    const seen = new Map<string, RoomEntry>();
    for (const item of rooms) {
      let peer: RoomHeader;
      let keys: RoomKeys;
      try {
        peer = s.crypto.openHeader(
          s.identity.xPk,
          s.identity.xSk,
          base64urlDecode(item.sealedHeader),
        );
        keys = keyCache.get(item.inboxRoomId) ?? deriveKeys(s, peer);
      } catch {
        void forget(item.inboxRoomId);
        continue;
      }
      if (keys.myInboxRoomId !== item.inboxRoomId || peer.peerExpiresAt <= now) {
        s.crypto.wipeRoomKeys(keys);
        void forget(item.inboxRoomId);
        continue;
      }
      keyCache.set(item.inboxRoomId, keys);
      const previous = chat.rooms.find((r) => r.inboxRoomId === item.inboxRoomId);
      const entry: RoomEntry = {
        inboxRoomId: item.inboxRoomId,
        peer,
        unread: item.unread,
        bump: previous?.bump ?? 0,
      };
      // Tidak pernah dua percakapan untuk username yang sama (PRD §8): yang lebih lama hangus duluan.
      const twin = seen.get(peer.peerUsername);
      if (twin) {
        const older = twin.peer.peerExpiresAt <= entry.peer.peerExpiresAt ? twin : entry;
        void forget(older.inboxRoomId);
        if (older === twin) {
          kept.splice(kept.indexOf(twin), 1, entry);
          seen.set(peer.peerUsername, entry);
        }
        continue;
      }
      seen.set(peer.peerUsername, entry);
      kept.push(entry);
    }
    chat.rooms = kept;
  } finally {
    chat.loading = false;
  }
}

async function forget(inboxRoomId: string): Promise<void> {
  const s = activeSession();
  chat.rooms = chat.rooms.filter((r) => r.inboxRoomId !== inboxRoomId);
  const keys = keyCache.get(inboxRoomId);
  if (keys) s?.crypto.wipeRoomKeys(keys);
  keyCache.delete(inboxRoomId);
  try {
    await s?.connection.request({ t: 'rooms.forget', inboxRoomId });
  } catch {
    // Akan dicoba lagi saat daftar dimuat ulang.
  }
}

// ================================================================ mulai percakapan

export type StartError = 'not_found' | 'self' | 'invalid' | 'room_full' | 'generic';

export class StartConversationError extends Error {
  override readonly name = 'StartConversationError';
  constructor(readonly code: StartError) {
    super(code);
  }
}

/** Verifikasi data lookup: userId sesuai edPk dan xPk ditandatangani edPk (PRD §4.2). */
function verifyLookup(s: ActiveSession, peer: LookupResponse): boolean {
  const edPk = base64urlDecode(peer.edPk);
  return (
    s.crypto.userIdFromEdPk(edPk) === peer.userId &&
    s.crypto.verifyXPk(edPk, base64urlDecode(peer.xPk), base64urlDecode(peer.xPkSig))
  );
}

/** Cari username → room.init → buka Chat (PRD §10.3 Home, §6.2 init). */
export async function startConversation(username: string, ttl: Ttl): Promise<void> {
  const s = requireSession();
  if (username === s.username) throw new StartConversationError('self');
  let peer: LookupResponse;
  try {
    peer = await relayApi.lookup(username);
  } catch (error) {
    throw new StartConversationError(
      error instanceof RelayError && error.status === 404 ? 'not_found' : 'generic',
    );
  }
  if (!verifyLookup(s, peer)) throw new StartConversationError('invalid');

  const header: RoomHeader = {
    v: 1,
    peerUserId: peer.userId,
    peerUsername: username,
    peerEdPk: peer.edPk,
    peerXPk: peer.xPk,
    peerXPkSig: peer.xPkSig,
    peerExpiresAt: peer.expiresAt,
  };
  const keys = deriveKeys(s, header);
  const op: InitOp = {
    kind: 'init',
    roomId: keys.roomId,
    members: [
      { memberTag: keys.myMemberTag, memberKey: base64urlEncode(keys.myMemberKey) },
      { memberTag: keys.peerMemberTag, memberKey: base64urlEncode(keys.peerMemberKey) },
    ],
    ttl,
  };
  const headerForPeer = base64urlEncode(
    s.crypto.sealHeader(base64urlDecode(peer.xPk), headerAboutMe(s)),
  );
  let result;
  try {
    result = await s.connection.request({
      t: 'room.init',
      op,
      auth: s.crypto.roomAuth(keys, op),
      peerUserId: peer.userId,
      myInboxRoomId: keys.myInboxRoomId,
      peerInboxRoomId: keys.peerInboxRoomId,
      sealedHeaderForSelf: base64urlEncode(s.crypto.sealHeader(s.identity.xPk, header)),
      sealedHeaderForPeer: headerForPeer,
    });
  } catch (error) {
    s.crypto.wipeRoomKeys(keys);
    if (error instanceof RequestError && error.code === 'not_found')
      throw new StartConversationError('not_found');
    throw new StartConversationError('generic');
  }

  const cached = keyCache.get(keys.myInboxRoomId);
  if (cached) s.crypto.wipeRoomKeys(cached);
  keyCache.set(keys.myInboxRoomId, keys);
  const existing = chat.rooms.find((r) => r.inboxRoomId === keys.myInboxRoomId);
  // Username sama dengan kunci baru (akun lama hangus lalu didaftarkan ulang): room lama dilupakan.
  for (const old of chat.rooms.filter(
    (r) => r.peer.peerUsername === username && r.inboxRoomId !== keys.myInboxRoomId,
  )) {
    void forget(old.inboxRoomId);
  }
  if (!existing)
    chat.rooms = [
      ...chat.rooms,
      { inboxRoomId: keys.myInboxRoomId, peer: header, unread: 0, bump: ++bumpCounter },
    ];
  await enterRoom(keys.myInboxRoomId, result.ttl);
  if (!result.created && result.ttl !== ttl)
    chat.chatNotice = strings.timer.simultaneous(result.ttl);
}

// ================================================================ buka & tutup room

/** Buka percakapan dari daftar. Lawan dicek dulu: hilang atau berganti kunci → room dilupakan (PRD §8). */
export async function openRoom(inboxRoomId: string): Promise<void> {
  const s = requireSession();
  const entry = chat.rooms.find((r) => r.inboxRoomId === inboxRoomId);
  if (!entry) return;
  let current: LookupResponse | null = null;
  try {
    current = await relayApi.lookup(entry.peer.peerUsername);
  } catch (error) {
    if (!(error instanceof RelayError && error.status === 404)) throw error;
  }
  if (!current || current.edPk !== entry.peer.peerEdPk || !verifyLookup(s, current)) {
    chat.notice = strings.errors.peerGone(entry.peer.peerUsername);
    await forget(inboxRoomId);
    return;
  }
  await enterRoom(inboxRoomId, null);
}

/**
 * Masuk ke room. Entri diambil dari `chat.rooms` (proxy $state yang sama), supaya perubahan penghitung di
 * room yang terbuka juga tampil di daftar.
 */
async function enterRoom(inboxRoomId: string, ttl: Ttl | null): Promise<void> {
  const s = requireSession();
  const entry = chat.rooms.find((r) => r.inboxRoomId === inboxRoomId);
  if (!entry) return;
  const keys = keyCache.get(entry.inboxRoomId) ?? deriveKeys(s, entry.peer);
  keyCache.set(entry.inboxRoomId, keys);
  closeRoom(false);
  chat.notice = null;
  chat.chatNotice = null;
  chat.open = {
    entry,
    keys,
    ttl: ttl ?? 5,
    headerForPeer: base64urlEncode(
      s.crypto.sealHeader(base64urlDecode(entry.peer.peerXPk), headerAboutMe(s)),
    ),
  };
  rememberView('chat', entry.inboxRoomId);
  navigate('chat');
  await syncOpenRoom();
}

/** Tutup room: plaintext dibuang dari memori. Timer yang sudah berjalan tetap berjalan di server (PRD §7.2). */
export function closeRoom(goHome = true): void {
  for (const m of chat.messages) m.text = null;
  chat.messages = [];
  chat.open = null;
  chat.chatNotice = null;
  if (goHome) {
    rememberView('home', null);
    navigate('home');
    void loadRooms().catch(() => undefined);
  }
}

// ================================================================ pesan

/**
 * Sinkron penuh room yang terbuka (PRD §8): dekripsi pesan baru, perbarui sisa timer, dan hancurkan pesan
 * lokal yang sudah tidak ada di server (lebur/dibatalkan). Lalu koreksi penghitung belum dibuka di inbox.
 */
export async function syncOpenRoom(): Promise<void> {
  const s = activeSession();
  const open = chat.open;
  if (!s || !open) return;
  const op = { kind: 'sync' as const, roomId: open.keys.roomId, sinceSeq: 0 };
  const result = await s.connection.request({
    t: 'room.sync',
    op,
    auth: s.crypto.roomAuth(open.keys, op),
  });
  if (chat.open !== open) return;
  open.ttl = result.ttl;

  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- variabel lokal
  const present = new Set(result.messages.map((m) => m.msgId));
  const kept = chat.messages.filter((m) => m.status === 'sending' || present.has(m.msgId));
  for (const m of chat.messages) if (!kept.includes(m)) m.text = null;

  for (const record of result.messages) {
    const local = kept.find((m) => m.msgId === record.msgId);
    if (local) {
      if (record.remainingMs !== undefined && local.status !== 'opened') {
        local.status = 'opened';
        local.remainingMs = record.remainingMs;
      }
      local.seq = record.seq;
      continue;
    }
    const message = decrypt(s, open, record);
    if (message) kept.push(message);
  }
  kept.sort((a, b) => a.seq - b.seq);
  chat.messages = kept;

  const unread = kept.filter((m) => !m.mine && m.status !== 'opened').length;
  open.entry.unread = unread;
  void s.connection
    .request({ t: 'rooms.setUnread', inboxRoomId: open.entry.inboxRoomId, n: unread })
    .catch(() => undefined);
}

function decrypt(s: ActiveSession, open: OpenRoom, record: SyncedMessage): ChatMessage | null {
  if (rejected.has(record.msgId)) return null;
  const fromEdPk = record.mine ? s.identity.edPk : base64urlDecode(open.entry.peer.peerEdPk);
  try {
    const { inner, contentKey } = s.crypto.decryptMessage({
      body: base64urlDecode(record.body),
      key: base64urlDecode(record.key),
      myXPk: s.identity.xPk,
      myXSk: s.identity.xSk,
      expected: { fromEdPk, roomId: open.keys.roomId, msgId: record.msgId },
    });
    s.crypto.wipe(contentKey);
    // Gambar ditampilkan mulai W10.
    if (inner.kind !== 'text' || inner.text === undefined) return null;
    const message: ChatMessage = {
      msgId: record.msgId,
      seq: record.seq,
      mine: record.mine,
      ttl: s.crypto.effectiveTtl(inner.ttl, record.ttl),
      text: inner.text,
      status: record.remainingMs !== undefined ? 'opened' : 'delivered',
    };
    if (record.remainingMs !== undefined) message.remainingMs = record.remainingMs;
    return message;
  } catch {
    rejected.add(record.msgId);
    return null;
  }
}

export type SendError = 'room_full' | 'offline' | 'peer_gone' | 'generic';

/** Kirim pesan teks (PRD §4.5). Timer pesan = timer room yang berlaku. */
export async function sendText(text: string): Promise<void> {
  const s = requireSession();
  const open = chat.open;
  if (!open) return;
  const trimmed = text.replace(/\s+$/, '');
  if (trimmed.length === 0) return;
  const msgId = s.crypto.newMsgId();
  const inner = s.crypto.signInner(s.identity.edSk, {
    v: 1,
    kind: 'text',
    msgId,
    roomId: open.keys.roomId,
    fromEdPk: base64urlEncode(s.identity.edPk),
    ttl: open.ttl,
    ts: Date.now(),
    text: trimmed,
  });
  const contentKey = s.crypto.newContentKey();
  const sealed = s.crypto.encryptMessage({
    inner,
    contentKey,
    myXPk: s.identity.xPk,
    peerXPk: base64urlDecode(open.entry.peer.peerXPk),
  });
  s.crypto.wipe(contentKey);

  const local: ChatMessage = {
    msgId,
    seq: Number.MAX_SAFE_INTEGER,
    mine: true,
    ttl: open.ttl,
    text: trimmed,
    status: 'sending',
  };
  chat.messages = [...chat.messages, local];
  const op = {
    kind: 'send' as const,
    roomId: open.keys.roomId,
    msgId,
    ttl: open.ttl,
    body: base64urlEncode(sealed.body),
    keyForPeer: base64urlEncode(sealed.keyForPeer),
    keyForSelf: base64urlEncode(sealed.keyForSelf),
    chunks: 0,
  };
  try {
    const { seq } = await s.connection.request({
      t: 'room.send',
      op,
      auth: s.crypto.roomAuth(open.keys, op),
      peerUserId: open.entry.peer.peerUserId,
      peerInboxRoomId: open.keys.peerInboxRoomId,
      sealedHeaderForPeer: open.headerForPeer,
    });
    const current = chat.messages.find((m) => m.msgId === msgId);
    if (current) {
      current.seq = seq;
      current.status = 'delivered';
    }
    open.entry.bump = ++bumpCounter;
  } catch (error) {
    chat.messages = chat.messages.filter((m) => m.msgId !== msgId);
    local.text = null;
    const code = error instanceof RequestError ? error.code : 'generic';
    if (code === 'room_full') chat.chatNotice = strings.errors.roomFull;
    else if (code === 'not_found')
      chat.chatNotice = strings.errors.peerGone(open.entry.peer.peerUsername);
    else if (code === 'offline' || code === 'timeout')
      chat.chatNotice = strings.session.reconnecting;
    else chat.chatNotice = strings.chat.sendFailed;
    throw error;
  }
}

/**
 * Pesan masuk terdepan benar-benar dilihat (PRD §7.2): minta server memulai timer. Timer tidak bisa dihentikan
 * setelah ini. Hanya satu pesan terdepan pada satu waktu.
 */
export async function markSeen(msgId: string): Promise<void> {
  const s = activeSession();
  const open = chat.open;
  const message = chat.messages.find((m) => m.msgId === msgId);
  if (!s || !open || !message || message.mine || message.status === 'opened') return;
  const op = { kind: 'opened' as const, roomId: open.keys.roomId, msgIds: [msgId] };
  const result = await s.connection.request({
    t: 'room.opened',
    op,
    auth: s.crypto.roomAuth(open.keys, op),
    peerUserId: open.entry.peer.peerUserId,
    peerInboxRoomId: open.keys.peerInboxRoomId,
  });
  const opened = result.opened.find((o) => o.msgId === msgId);
  if (!opened) return;
  message.status = 'opened';
  message.remainingMs = opened.remainingMs;
  open.entry.unread = Math.max(0, open.entry.unread - 1);
}

/** Bubble selesai melebur (termasuk animasi 600 ms dan "Dilebur" 3 dtk): buang dari memori. */
export function removeMessage(msgId: string): void {
  const message = chat.messages.find((m) => m.msgId === msgId);
  if (message) message.text = null;
  chat.messages = chat.messages.filter((m) => m.msgId !== msgId);
}

// ================================================================ event relay

function handleEvent(event: EventFrame): void {
  const { inboxRoomId, payload } = event;
  const entry = chat.rooms.find((r) => r.inboxRoomId === inboxRoomId);
  // Event untuk room yang tidak dikenal hanya memicu pemuatan ulang daftar (D-013: event bisa dipalsukan).
  if (!entry) {
    if (payload.t === 'new') void loadRooms().catch(() => undefined);
    return;
  }
  const isOpen = chat.open?.entry.inboxRoomId === inboxRoomId;
  switch (payload.t) {
    case 'new':
      entry.bump = ++bumpCounter;
      if (isOpen) void syncOpenRoom().catch(() => undefined);
      else entry.unread = Math.min(entry.unread + 1, LIMITS.ROOM_MAX_PENDING_MESSAGES);
      return;
    case 'opened': {
      if (!isOpen) return;
      const message = chat.messages.find((m) => m.msgId === payload.msgId && m.mine);
      if (message && message.status !== 'opened') {
        message.status = 'opened';
        message.remainingMs = payload.remainingMs;
      }
      return;
    }
    default:
      // retracted & ttl_* di W9.
      return;
  }
}

onRelayEvent(handleEvent);

onSessionReady(({ lastRoomId }) => {
  void (async () => {
    try {
      await loadRooms();
      if (chat.open) await syncOpenRoom();
      else if (lastRoomId && chat.rooms.some((r) => r.inboxRoomId === lastRoomId))
        await openRoom(lastRoomId);
    } catch {
      // Koneksi putus lagi; dicoba saat ready berikutnya.
    }
  })();
});

onSessionEnd(() => {
  for (const m of chat.messages) m.text = null;
  wipeKeys();
  rejected.clear();
  chat.rooms = [];
  chat.messages = [];
  chat.open = null;
  chat.notice = null;
  chat.chatNotice = null;
});
