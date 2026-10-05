import { WS } from '@blackchat/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backoffDelay, RelayConnection, RequestError, type ConnectionStatus } from './ws';

/** WebSocket palsu yang dikendalikan test. */
class FakeSocket extends EventTarget {
  static OPEN = 1;
  static CONNECTING = 0;
  readyState = 1;
  sent: string[] = [];
  closedWith: number | undefined;
  send(data: string) {
    this.sent.push(data);
  }
  close(code?: number) {
    this.closedWith = code;
    this.readyState = 3;
  }
  receive(frame: unknown) {
    this.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify(frame) }));
  }
  drop(code: number) {
    this.readyState = 3;
    this.dispatchEvent(Object.assign(new Event('close'), { code }));
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', FakeSocket);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function connect() {
  const sockets: FakeSocket[] = [];
  const statuses: ConnectionStatus[] = [];
  const events: unknown[] = [];
  let remaining = -1;
  const connection = new RelayConnection({
    url: 'ws://relay/v1/ws/X',
    userId: 'X',
    signChallenge: () => new Uint8Array(64).fill(7),
    onStatus: (s) => statuses.push(s),
    onReady: (ms) => (remaining = ms),
    onEvent: (e) => events.push(e),
    createSocket: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s as unknown as WebSocket;
    },
  });
  connection.start();
  const ready = () => {
    const s = sockets.at(-1)!;
    s.receive({ t: 'challenge', nonce: 'A'.repeat(43) });
    s.receive({ t: 'ready', remainingMs: 1000 });
  };
  return { connection, sockets, statuses, events, ready, remaining: () => remaining };
}

describe('backoff reconnect (PRD §13.1)', () => {
  it('0,5 → 1 → 2 → 4 → 8 → maks 10 dtk, jitter ±20 %', () => {
    const mid = () => 0.5;
    expect([0, 1, 2, 3, 4, 5, 9].map((n) => backoffDelay(n, mid))).toEqual([
      500, 1000, 2000, 4000, 8000, 10000, 10000,
    ]);
    expect(backoffDelay(0, () => 0)).toBe(400);
    expect(backoffDelay(0, () => 1)).toBe(600);
    expect(backoffDelay(10, () => 1)).toBe(10000);
  });
});

describe('RelayConnection', () => {
  it('menjawab challenge dengan tanda tangan lalu ready', () => {
    const c = connect();
    c.ready();
    expect(JSON.parse(c.sockets[0]!.sent[0]!)).toEqual({
      t: 'auth',
      sig: expect.stringMatching(/^[A-Za-z0-9_-]{86}$/),
    });
    expect(c.statuses).toEqual(['connecting', 'ready']);
    expect(c.remaining()).toBe(1000);
  });

  it('request dicocokkan dengan result lewat reqId dan divalidasi', async () => {
    const c = connect();
    c.ready();
    const promise = c.connection.request({ t: 'rooms' });
    const sent = JSON.parse(c.sockets[0]!.sent.at(-1)!) as { reqId: number };
    c.sockets[0]!.receive({ t: 'result', reqId: sent.reqId, ok: true, data: { rooms: [] } });
    await expect(promise).resolves.toEqual({ rooms: [] });
  });

  it('result error dan data tidak valid ditolak', async () => {
    const c = connect();
    c.ready();
    const a = c.connection.request({ t: 'rooms' });
    const b = c.connection.request({ t: 'rooms' });
    const [ra, rb] = c.sockets[0]!.sent.slice(-2).map(
      (s) => (JSON.parse(s) as { reqId: number }).reqId,
    );
    c.sockets[0]!.receive({ t: 'result', reqId: ra, ok: false, error: 'room_full' });
    c.sockets[0]!.receive({ t: 'result', reqId: rb, ok: true, data: { rooms: 'bukan array' } });
    await expect(a).rejects.toEqual(new RequestError('room_full'));
    await expect(b).rejects.toEqual(new RequestError('invalid'));
  });

  it('request saat belum ready → offline; timeout setelah 15 dtk', async () => {
    const c = connect();
    await expect(c.connection.request({ t: 'rooms' })).rejects.toEqual(new RequestError('offline'));
    c.ready();
    const pending = c.connection.request({ t: 'rooms' });
    vi.advanceTimersByTime(15_000);
    await expect(pending).rejects.toEqual(new RequestError('timeout'));
  });

  it('heartbeat ping tiap 25 dtk dengan string persis untuk auto-response', () => {
    const c = connect();
    c.ready();
    vi.advanceTimersByTime(WS.HEARTBEAT_MS);
    expect(c.sockets[0]!.sent.at(-1)).toBe(WS.PING);
  });

  it('putus → reconnecting dengan backoff, request tertunda ditolak', async () => {
    const c = connect();
    c.ready();
    const pending = c.connection.request({ t: 'rooms' });
    c.sockets[0]!.drop(1006);
    await expect(pending).rejects.toEqual(new RequestError('offline'));
    expect(c.statuses.at(-1)).toBe('reconnecting');
    vi.advanceTimersByTime(600);
    expect(c.sockets).toHaveLength(2);
    c.ready();
    expect(c.statuses.at(-1)).toBe('ready');
  });

  it('4409 → replaced tanpa reconnect otomatis; takeOver menyambung lagi', () => {
    const c = connect();
    c.ready();
    c.sockets[0]!.drop(WS.CLOSE.REPLACED);
    expect(c.statuses.at(-1)).toBe('replaced');
    vi.advanceTimersByTime(60_000);
    expect(c.sockets).toHaveLength(1);
    c.connection.takeOver();
    expect(c.sockets).toHaveLength(2);
  });

  it('4410 → expired; stop() tidak menyambung ulang', () => {
    const c = connect();
    c.ready();
    c.sockets[0]!.drop(WS.CLOSE.EXPIRED);
    expect(c.statuses.at(-1)).toBe('expired');
    const d = connect();
    d.ready();
    d.connection.stop();
    vi.advanceTimersByTime(60_000);
    expect(d.sockets).toHaveLength(1);
    expect(d.statuses.at(-1)).toBe('closed');
  });

  it('event diteruskan; frame tidak valid diabaikan', () => {
    const c = connect();
    c.ready();
    c.sockets[0]!.receive({
      t: 'event',
      inboxRoomId: 'a'.repeat(64),
      payload: { t: 'new', seq: 2 },
    });
    c.sockets[0]!.receive({ t: 'event', inboxRoomId: 'bukan-hex', payload: { t: 'new', seq: 2 } });
    expect(c.events).toHaveLength(1);
  });
});
