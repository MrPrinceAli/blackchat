import { SESSION } from '@blackchat/protocol';
import { describe, expect, it } from 'vitest';
import {
  SessionManager,
  type KeyRecord,
  type KeyStore,
  type SessionSecrets,
  type TabPresence,
  type TabStore,
} from './session';

const MIN = 60_000;

function memoryKeys(): KeyStore & { map: Map<string, KeyRecord> } {
  const map = new Map<string, KeyRecord>();
  return {
    map,
    get: async (id) => map.get(id),
    put: async (id, r) => void map.set(id, r),
    touch: async (id, t) => {
      const r = map.get(id);
      if (r) map.set(id, { ...r, lastActive: t });
    },
    delete: async (id) => void map.delete(id),
    sweep: async (olderThan) => {
      for (const [id, r] of map) if (r.lastActive < olderThan) map.delete(id);
    },
  };
}

function memoryTab(initial?: Map<string, string>): TabStore & { map: Map<string, string> } {
  const map = new Map(initial);
  return {
    map,
    get: (n) => map.get(n) ?? null,
    set: (n, v) => void map.set(n, v),
    remove: (n) => void map.delete(n),
  };
}

/** Kehadiran tab bersama: meniru BroadcastChannel antar-tab dalam satu browser. */
function presenceHub() {
  const claimed = new Set<string>();
  return (): TabPresence & { mine: string | null } => {
    const self = {
      mine: null as string | null,
      isTaken: async (id: string) => claimed.has(id) && self.mine !== id,
      claim: (id: string) => {
        if (self.mine) claimed.delete(self.mine);
        self.mine = id;
        claimed.add(id);
      },
      release: () => {
        if (self.mine) claimed.delete(self.mine);
        self.mine = null;
      },
    };
    return self;
  };
}

const secrets: SessionSecrets = {
  username: 'rara',
  userId: '0123456789ABCDEFGHJKMNPQRSTVWXYZ',
  edPk: 'a',
  edSk: 'b',
  xPk: 'c',
  xSk: 'd',
  xPkSig: 'e',
  vaultKey: 'f',
  seq: 3,
  contacts: null,
  expiresAtLocal: 123,
  lastRoomId: 'room-9',
};

let counter = 0;
function manager(keys: KeyStore, tab: TabStore, presence: TabPresence, clock: { now: number }) {
  return new SessionManager({
    keys,
    tab,
    presence,
    now: () => clock.now,
    randomTabId: () => `tab-${++counter}`,
  });
}

describe('sesi tahan refresh (PRD §5.4)', () => {
  it('refresh: state dipulihkan dari sessionStorage terenkripsi + kunci di IndexedDB', async () => {
    const clock = { now: 1_000_000 };
    const keys = memoryKeys();
    const tab = memoryTab();
    const hub = presenceHub();
    const first = manager(keys, tab, hub(), clock);
    await first.create(secrets, { screen: 'chat' });

    // Isi sessionStorage terenkripsi, bukan teks biasa.
    const blob = tab.map.get(SESSION.STORAGE_KEYS.SESSION)!;
    expect(blob).not.toContain('rara');
    expect(blob).not.toContain('room-9');
    expect(keys.map.size).toBe(1);
    const [record] = [...keys.map.values()];
    expect(record!.key.extractable).toBe(false);

    first['deps'].presence.release(); // halaman lama tertutup saat refresh
    clock.now += 5 * MIN;
    const restored = await manager(keys, tab, hub(), clock).restore();
    expect(restored).toEqual({ secrets, view: { screen: 'chat' }, duplicate: false });
  });

  it('refresh setelah tidak aktif > 10 menit → harus login ulang, storage dibersihkan', async () => {
    const clock = { now: 1_000_000 };
    const keys = memoryKeys();
    const tab = memoryTab();
    const hub = presenceHub();
    await manager(keys, tab, hub(), clock).create(secrets, { screen: 'home' });
    clock.now += 10 * MIN + 1;
    expect(await manager(keys, tab, hub(), clock).restore()).toBeNull();
    expect(keys.map.size).toBe(0);
    expect(tab.map.size).toBe(0);
  });

  it('tab baru (sessionStorage kosong) → harus login ulang', async () => {
    const clock = { now: 1_000_000 };
    const keys = memoryKeys();
    const hub = presenceHub();
    await manager(keys, memoryTab(), hub(), clock).create(secrets, { screen: 'home' });
    expect(await manager(keys, memoryTab(), hub(), clock).restore()).toBeNull();
  });

  it('touch memperpanjang umur entri IndexedDB', async () => {
    const clock = { now: 1_000_000 };
    const keys = memoryKeys();
    const tab = memoryTab();
    const hub = presenceHub();
    const m = manager(keys, tab, hub(), clock);
    await m.create(secrets, { screen: 'home' });
    clock.now += 8 * MIN;
    await m.touch(clock.now);
    hub().release();
    clock.now += 8 * MIN;
    m['deps'].presence.release();
    expect(await manager(keys, tab, hub(), clock).restore()).not.toBeNull();
  });

  it('tab duplikat mendapat tabId & sessionKey baru; tab asli tetap utuh', async () => {
    const clock = { now: 1_000_000 };
    const keys = memoryKeys();
    const hub = presenceHub();
    const originalTab = memoryTab();
    const original = manager(keys, originalTab, hub(), clock);
    await original.create(secrets, { screen: 'home' });

    // Browser menyalin sessionStorage ke tab duplikat.
    const copyTab = memoryTab(originalTab.map);
    const restored = await manager(keys, copyTab, hub(), clock).restore();
    expect(restored?.duplicate).toBe(true);
    expect(restored?.secrets).toEqual(secrets);
    expect(copyTab.map.get(SESSION.STORAGE_KEYS.TAB)).not.toBe(
      originalTab.map.get(SESSION.STORAGE_KEYS.TAB),
    );
    expect(keys.map.size).toBe(2);
    const [a, b] = [...keys.map.values()];
    expect(a!.key).not.toBe(b!.key);
  });

  it('clear: entri IndexedDB dan semua bc.* hilang', async () => {
    const clock = { now: 1_000_000 };
    const keys = memoryKeys();
    const tab = memoryTab(new Map([['lain', 'tetap']]));
    const m = manager(keys, tab, presenceHub()(), clock);
    await m.create(secrets, { screen: 'home' });
    await m.clear();
    expect(keys.map.size).toBe(0);
    expect([...tab.map.keys()]).toEqual(['lain']);
  });

  it('sessionStorage yang dirusak → login ulang, bukan crash', async () => {
    const clock = { now: 1_000_000 };
    const keys = memoryKeys();
    const tab = memoryTab();
    const hub = presenceHub();
    await manager(keys, tab, hub(), clock).create(secrets, { screen: 'home' });
    tab.map.set(
      SESSION.STORAGE_KEYS.SESSION,
      JSON.stringify({ iv: 'AAAAAAAAAAAAAAAA', ct: 'AAAA' }),
    );
    hub().release();
    expect(await manager(keys, tab, presenceHub()(), clock).restore()).toBeNull();
  });
});
