// loadRooms menyaring entri room yang tidak sah (PRD §8, D-013) dengan kripto sungguhan dan relay tiruan.
import * as crypto from '@blackchat/crypto';
import { base64urlEncode, hexEncode, type RoomHeader } from '@blackchat/protocol';
import { beforeAll, describe, expect, it, vi } from 'vitest';

await crypto.ready();
const me = crypto.generateIdentity();
const bob = crypto.generateIdentity();
const carol = crypto.generateIdentity();

const requests: { t: string; [k: string]: unknown }[] = [];
let roomsResponse: { inboxRoomId: string; sealedHeader: string; unread: number }[] = [];

vi.mock('./account', () => ({
  activeSession: () => ({
    crypto,
    identity: me,
    username: 'saya',
    userId: me.userId,
    expiresAtLocal: Date.now() + 3_600_000,
    connection: {
      request: async (frame: { t: string }) => {
        requests.push(frame);
        return frame.t === 'rooms' ? { rooms: roomsResponse } : {};
      },
    },
  }),
  onRelayEvent: () => undefined,
  onSessionEnd: () => undefined,
  onSessionReady: () => undefined,
  rememberView: () => undefined,
}));

const { chat, loadRooms } = await import('./chat.svelte');

const HOUR = 3_600_000;
const header = (
  peer: crypto.Identity,
  username: string,
  expiresAt = Math.ceil(Date.now() / HOUR) * HOUR + 24 * HOUR,
): RoomHeader => ({
  v: 1,
  peerUserId: peer.userId,
  peerUsername: username,
  peerEdPk: base64urlEncode(peer.edPk),
  peerXPk: base64urlEncode(peer.xPk),
  peerXPkSig: base64urlEncode(peer.xPkSig),
  peerExpiresAt: expiresAt,
});
const sealForMe = (h: RoomHeader) => base64urlEncode(crypto.sealHeader(me.xPk, h));
const inboxIdWith = (peer: crypto.Identity) =>
  crypto.deriveRoom(me.xSk, peer.xPk, me.edPk, peer.edPk).myInboxRoomId;

describe('loadRooms menyaring entri tidak sah (PRD §8, D-013)', () => {
  beforeAll(async () => {
    roomsResponse = [
      // Sah.
      { inboxRoomId: inboxIdWith(bob), sealedHeader: sealForMe(header(bob, 'bob')), unread: 2 },
      // Palsu: header sah tentang carol (siapa pun bisa menyegel ke xPk saya), inboxRoomId karangan.
      {
        inboxRoomId: hexEncode(new Uint8Array(32).fill(7)),
        sealedHeader: sealForMe(header(carol, 'carol')),
        unread: 1,
      },
      // Header bukan untuk saya.
      {
        inboxRoomId: hexEncode(new Uint8Array(32).fill(8)),
        sealedHeader: base64urlEncode(crypto.sealHeader(bob.xPk, header(carol, 'carol'))),
        unread: 0,
      },
      // Lawan sudah hangus.
      {
        inboxRoomId: inboxIdWith(carol),
        sealedHeader: sealForMe(header(carol, 'carol', HOUR)),
        unread: 0,
      },
    ];
    await loadRooms();
  });

  it('hanya entri sah yang tampil', () => {
    expect(chat.rooms.map((r) => r.peer.peerUsername)).toEqual(['bob']);
    expect(chat.rooms[0]?.unread).toBe(2);
  });

  it('entri tidak sah dilupakan di relay', () => {
    const forgotten = requests.filter((r) => r.t === 'rooms.forget').map((r) => r['inboxRoomId']);
    expect(forgotten.sort()).toEqual(
      [
        hexEncode(new Uint8Array(32).fill(7)),
        hexEncode(new Uint8Array(32).fill(8)),
        inboxIdWith(carol),
      ].sort(),
    );
  });
});
