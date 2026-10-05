// Sesi tahan refresh yang terikat ke satu tab (PRD §5.4 langkah 1–9).
// - sessionKey AES-GCM non-extractable disimpan di IndexedDB `sessions` dengan kunci tabId.
// - State rahasia terenkripsi di sessionStorage (`bc.tab`, `bc.sess`, `bc.view`), hanya hidup di tab ini.
// File ini satu-satunya yang boleh memakai sessionStorage dan IndexedDB (PRD §12 aturan 6).
import {
  base64urlDecode,
  base64urlEncode,
  SESSION,
  utf8Decode,
  utf8Encode,
} from '@blackchat/protocol';

/** State rahasia yang bertahan saat refresh. Nilai biner dalam base64url. */
export interface SessionSecrets {
  username: string;
  userId: string;
  edPk: string;
  edSk: string;
  xPk: string;
  xSk: string;
  xPkSig: string;
  vaultKey: string;
  seq: number;
  contacts: string | null;
  /** Perkiraan waktu hangus menurut jam perangkat; dikoreksi oleh `ready.remainingMs` dari server. */
  expiresAtLocal: number;
  /** Room terakhir yang dibuka (disimpan terenkripsi, bukan nomor urut daftar; PRD §5.4 langkah 4). */
  lastRoomId: string | null;
}

export interface SessionView {
  screen: 'home' | 'chat';
}

export interface KeyRecord {
  key: CryptoKey;
  lastActive: number;
}

/** Penyimpanan sessionKey per tab (IndexedDB di browser). */
export interface KeyStore {
  get(tabId: string): Promise<KeyRecord | undefined>;
  put(tabId: string, record: KeyRecord): Promise<void>;
  touch(tabId: string, lastActive: number): Promise<void>;
  delete(tabId: string): Promise<void>;
  /** Hapus entri yang lastActive-nya lebih tua dari batas. */
  sweep(olderThan: number): Promise<void>;
}

/** Penyimpanan per tab (sessionStorage di browser). */
export interface TabStore {
  get(name: string): string | null;
  set(name: string, value: string): void;
  remove(name: string): void;
}

/** Deteksi tab lain yang memakai tabId yang sama (tab duplikat menyalin sessionStorage). */
export interface TabPresence {
  /** true jika tab lain yang masih hidup mengaku memegang tabId ini. */
  isTaken(tabId: string): Promise<boolean>;
  claim(tabId: string): void;
  release(): void;
}

export interface SessionDeps {
  keys: KeyStore;
  tab: TabStore;
  presence: TabPresence;
  now: () => number;
  randomTabId: () => string;
}

const { TAB, SESSION: SESS, VIEW } = SESSION.STORAGE_KEYS;

export class SessionManager {
  private tabId: string | null = null;
  private key: CryptoKey | null = null;

  constructor(private readonly deps: SessionDeps) {}

  /** Login/register berhasil: buat tabId & sessionKey baru lalu simpan state terenkripsi. */
  async create(secrets: SessionSecrets, view: SessionView): Promise<void> {
    await this.rotate();
    await this.save(secrets, view);
  }

  /**
   * Saat aplikasi dimuat (langkah 6): sapu entri basi, lalu pulihkan sesi jika tab ini punya entri yang masih valid.
   * Tab duplikat mendapat tabId & sessionKey baru sehingga kedua tab tidak berbagi kunci.
   */
  async restore(): Promise<{
    secrets: SessionSecrets;
    view: SessionView;
    duplicate: boolean;
  } | null> {
    const now = this.deps.now();
    await this.deps.keys.sweep(now - SESSION.IDLE_LOCK_MS);
    const tabId = this.deps.tab.get(TAB);
    const blob = this.deps.tab.get(SESS);
    if (!tabId || !blob) return this.forget();
    const record = await this.deps.keys.get(tabId);
    if (!record || now - record.lastActive > SESSION.IDLE_LOCK_MS) return this.forget();

    let secrets: SessionSecrets;
    try {
      secrets = await decrypt(record.key, blob);
    } catch {
      return this.forget();
    }
    const view = parseView(this.deps.tab.get(VIEW));

    const duplicate = await this.deps.presence.isTaken(tabId);
    if (duplicate) {
      await this.rotate();
      await this.save(secrets, view);
    } else {
      this.tabId = tabId;
      this.key = record.key;
      this.deps.presence.claim(tabId);
      await this.deps.keys.touch(tabId, now);
    }
    return { secrets, view, duplicate };
  }

  /** Enkripsi ulang state (misal seq/lastRoomId berubah atau layar berganti). */
  async save(secrets: SessionSecrets, view: SessionView): Promise<void> {
    if (!this.key || !this.tabId) throw new Error('sesi belum dibuat');
    this.deps.tab.set(TAB, this.tabId);
    this.deps.tab.set(SESS, await encrypt(this.key, secrets));
    this.deps.tab.set(VIEW, JSON.stringify(view));
  }

  /** Aktivitas pengguna (langkah 5; pemanggil membatasi 1× per 15 dtk). */
  async touch(lastActive: number): Promise<void> {
    if (this.tabId) await this.deps.keys.touch(this.tabId, lastActive);
  }

  /** Kunci, logout, atau hangus (langkah 8): hapus entri IndexedDB dan semua bc.* di sessionStorage. */
  async clear(): Promise<void> {
    const tabId = this.tabId;
    this.tabId = null;
    this.key = null;
    this.deps.presence.release();
    if (tabId) await this.deps.keys.delete(tabId);
    for (const name of [TAB, SESS, VIEW]) this.deps.tab.remove(name);
  }

  private async rotate(): Promise<void> {
    this.tabId = this.deps.randomTabId();
    this.key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    await this.deps.keys.put(this.tabId, { key: this.key, lastActive: this.deps.now() });
    this.deps.presence.claim(this.tabId);
  }

  private forget(): null {
    for (const name of [TAB, SESS, VIEW]) this.deps.tab.remove(name);
    return null;
  }
}

function parseView(raw: string | null): SessionView {
  try {
    const parsed = JSON.parse(raw ?? '') as { screen?: unknown };
    return { screen: parsed.screen === 'chat' ? 'chat' : 'home' };
  } catch {
    return { screen: 'home' };
  }
}

async function encrypt(key: CryptoKey, secrets: SessionSecrets): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(SESSION.AES_GCM_IV_BYTES));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, utf8Encode(JSON.stringify(secrets))),
  );
  return JSON.stringify({ iv: base64urlEncode(iv), ct: base64urlEncode(ct) });
}

async function decrypt(key: CryptoKey, blob: string): Promise<SessionSecrets> {
  const { iv, ct } = JSON.parse(blob) as { iv: string; ct: string };
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64urlDecode(iv) },
    key,
    base64urlDecode(ct),
  );
  return JSON.parse(utf8Decode(new Uint8Array(plain))) as SessionSecrets;
}

// ================================================================ implementasi browser

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let database: Promise<IDBDatabase> | undefined;

function openDb(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const open = indexedDB.open(SESSION.IDB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(SESSION.IDB_STORE);
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  return database;
}

async function store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return (await openDb()).transaction(SESSION.IDB_STORE, mode).objectStore(SESSION.IDB_STORE);
}

export const idbKeyStore: KeyStore = {
  async get(tabId) {
    return (await request((await store('readonly')).get(tabId))) as KeyRecord | undefined;
  },
  async put(tabId, record) {
    await request((await store('readwrite')).put(record, tabId));
  },
  async touch(tabId, lastActive) {
    const s = await store('readwrite');
    const record = (await request(s.get(tabId))) as KeyRecord | undefined;
    if (record) await request(s.put({ ...record, lastActive }, tabId));
  },
  async delete(tabId) {
    await request((await store('readwrite')).delete(tabId));
  },
  async sweep(olderThan) {
    const s = await store('readwrite');
    const keys = (await request(s.getAllKeys())) as string[];
    for (const tabId of keys) {
      const record = (await request(s.get(tabId))) as KeyRecord | undefined;
      if (!record || record.lastActive < olderThan) await request(s.delete(tabId));
    }
  },
};

export const sessionTabStore: TabStore = {
  get: (name) => {
    try {
      return sessionStorage.getItem(name);
    } catch {
      return null;
    }
  },
  set: (name, value) => sessionStorage.setItem(name, value),
  remove: (name) => {
    try {
      sessionStorage.removeItem(name);
    } catch {
      // Storage tidak tersedia: tidak ada yang perlu dihapus.
    }
  },
};

/** Jumlah entri sesi di IndexedDB dan sessionStorage (untuk test: harus 0 setelah kunci/logout). */
export async function storageFootprint(): Promise<{ idb: number; tab: number }> {
  const idb = ((await request((await store('readonly')).getAllKeys())) as string[]).length;
  const tab = Object.keys(sessionStorage).filter((k) => k.startsWith('bc.')).length;
  return { idb, tab };
}

/** Kehadiran tab lewat BroadcastChannel("bc-tab") (PRD §5.4, tab duplikat). */
export function broadcastPresence(timeoutMs = 150): TabPresence {
  const channel = new BroadcastChannel(SESSION.BROADCAST_CHANNEL);
  let mine: string | null = null;
  channel.addEventListener('message', (event: MessageEvent<{ t: string; tabId: string }>) => {
    if (event.data.t === 'probe' && mine !== null && event.data.tabId === mine) {
      channel.postMessage({ t: 'here', tabId: mine });
    }
  });
  return {
    isTaken(tabId) {
      return new Promise((resolve) => {
        const onMessage = (event: MessageEvent<{ t: string; tabId: string }>) => {
          if (event.data.t === 'here' && event.data.tabId === tabId) done(true);
        };
        const done = (taken: boolean) => {
          clearTimeout(timer);
          channel.removeEventListener('message', onMessage);
          resolve(taken);
        };
        const timer = setTimeout(() => done(false), timeoutMs);
        channel.addEventListener('message', onMessage);
        channel.postMessage({ t: 'probe', tabId });
      });
    },
    claim(tabId) {
      mine = tabId;
    },
    release() {
      mine = null;
    },
  };
}
