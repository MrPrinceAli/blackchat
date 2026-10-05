import { describe, expect, it, vi } from 'vitest';

// chat.svelte.ts mendaftarkan kait sesi saat dimuat; modul account diganti tiruan agar test murni.
vi.mock('./account', () => ({
  activeSession: () => null,
  onRelayEvent: () => undefined,
  onSessionEnd: () => undefined,
  onSessionReady: () => undefined,
  rememberView: () => undefined,
}));

const { queueFront, sortedRooms } = await import('./chat.svelte');
type Room = Parameters<typeof sortedRooms>[0][number];
type Message = Parameters<typeof queueFront>[0][number];

const room = (name: string, unread = 0, bump = 0): Room => ({
  inboxRoomId: name,
  unread,
  bump,
  peer: {
    v: 1,
    peerUserId: '',
    peerUsername: name,
    peerEdPk: '',
    peerXPk: '',
    peerXPkSig: '',
    peerExpiresAt: 0,
  },
});

const msg = (
  msgId: string,
  seq: number,
  mine: boolean,
  status: Message['status'] = 'delivered',
): Message => ({
  msgId,
  seq,
  mine,
  ttl: 5,
  kind: 'text',
  text: msgId,
  status,
});

describe('urutan daftar percakapan (PRD §8)', () => {
  it('belum dibuka di atas, sisanya alfabetis', () => {
    expect(
      sortedRooms([room('zara'), room('dimas', 2), room('budi'), room('ani', 1)]).map(
        (r) => r.inboxRoomId,
      ),
    ).toEqual(['ani', 'dimas', 'budi', 'zara']);
  });

  it('percakapan yang baru menerima pesan di sesi ini pindah ke paling atas', () => {
    expect(
      sortedRooms([room('ani', 1), room('zara', 0, 2), room('budi', 0, 1)]).map(
        (r) => r.inboxRoomId,
      ),
    ).toEqual(['zara', 'budi', 'ani']);
  });
});

describe('antrean lebur berurutan (PRD §7.2)', () => {
  it('hanya pesan masuk dengan seq terkecil yang terdepan; pesan sendiri tidak ikut antre', () => {
    const list = [msg('b', 4, false), msg('mine', 1, true), msg('a', 2, false), msg('c', 5, false)];
    expect(queueFront(list)).toBe('a');
  });

  it('pesan terdepan yang sedang dihitung mundur tetap terdepan sampai dibuang', () => {
    expect(queueFront([msg('a', 2, false, 'opened'), msg('b', 3, false)])).toBe('a');
    expect(queueFront([msg('b', 3, false)])).toBe('b');
  });

  it('tidak ada pesan masuk → null', () => {
    expect(queueFront([msg('mine', 1, true)])).toBeNull();
    expect(queueFront([])).toBeNull();
  });
});
