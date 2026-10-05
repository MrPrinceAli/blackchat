import { env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import {
  ACCOUNT,
  base64urlEncode,
  encodeChunkFrame,
  IMAGE_CIPHER_CHUNK_BYTES,
  LABELS,
  LIMITS,
  WS,
  type SendOp,
  type SyncResult,
} from '@blackchat/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { advanceClock, call, HOUR, registered, resetClock, type TestAccount } from './helpers.js';
import {
  authFor,
  b64,
  initFrame,
  newRoom,
  openedFrame,
  purgeFrame,
  retractFrame,
  sendFrame,
  sendOp,
  syncFrame,
  chunkData,
  chunkHeader,
  getChunkFrame,
  TestSocket,
  ttlFrame,
  type TestRoom,
} from './ws.js';

afterEach(async () => {
  await resetClock();
});

const inbox = (userId: string) => env.INBOX.get(env.INBOX.idFromName(`inbox:${userId}`));
const roomStub = (roomId: string) => env.ROOM.get(env.ROOM.idFromName(`room:${roomId}`));

/** Dua akun, A online, room A–B sudah dibuat oleh A. */
async function pair(ttl: 3 | 5 | 7 | 10 = 5) {
  const alice = await registered();
  const bob = await registered();
  const room = newRoom();
  const a = await TestSocket.connect(alice);
  const init = await a.request(initFrame(room, 'a', bob, ttl));
  expect(init).toMatchObject({ ok: true, data: { ttl, created: true } });
  return { alice, bob, room, a };
}

async function dumpSql(
  stub: DurableObjectStub,
  tables: string[],
): Promise<Record<string, unknown[]>> {
  return runInDurableObject(stub, async (_instance, state) => {
    const out: Record<string, unknown[]> = {};
    for (const table of tables) {
      const exists =
        state.storage.sql
          .exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", table)
          .toArray().length > 0;
      out[table] = exists ? state.storage.sql.exec(`SELECT * FROM ${table}`).toArray() : [];
    }
    return out;
  });
}

const hasTables = (stub: DurableObjectStub) =>
  runInDurableObject(
    stub,
    async (_i, state) =>
      state.storage.sql
        .exec(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%'",
        )
        .toArray().length > 0,
  );

describe('koneksi WebSocket (PRD §6.1)', () => {
  it('challenge-response Ed25519 → ready dengan sisa umur akun', async () => {
    const alice = await registered();
    const socket = await TestSocket.open(alice.userId);
    const ready = await socket.authenticate(alice);
    expect(ready).toMatchObject({ t: 'ready' });
    if (ready.t === 'ready') expect(ready.remainingMs).toBeLessThanOrEqual(ACCOUNT.LIFETIME_MS);
  });

  it('tanda tangan akun lain ditolak dengan 4401', async () => {
    const alice = await registered();
    const mallory = await registered();
    const socket = await TestSocket.open(alice.userId);
    socket.authenticate(alice, mallory.sign).catch(() => undefined);
    expect((await socket.closed).code).toBe(WS.CLOSE.UNAUTHORIZED);
  });

  it('frame selain auth sebelum autentikasi → 4401; JSON rusak → 4400', async () => {
    const alice = await registered();
    const s1 = await TestSocket.open(alice.userId);
    await s1.next((f) => f.t === 'challenge');
    s1.sendRaw(JSON.stringify({ t: 'rooms', reqId: 1 }));
    expect((await s1.closed).code).toBe(WS.CLOSE.UNAUTHORIZED);
    const s2 = await TestSocket.connect(alice);
    s2.sendRaw('{bukan json');
    expect((await s2.closed).code).toBe(WS.CLOSE.PROTOCOL_ERROR);
  });

  it('socket baru yang terautentikasi menutup yang lama dengan 4409', async () => {
    const alice = await registered();
    const first = await TestSocket.connect(alice);
    await TestSocket.connect(alice);
    expect((await first.closed).code).toBe(WS.CLOSE.REPLACED);
  });

  it('socket yang belum terautentikasi tidak bisa memutus pemilik akun', async () => {
    const alice = await registered();
    const owner = await TestSocket.connect(alice);
    for (let i = 0; i < LIMITS.INBOX_MAX_PENDING_SOCKETS + 2; i++)
      await TestSocket.open(alice.userId);
    const rooms = await owner.request({ t: 'rooms' });
    expect(rooms).toMatchObject({ ok: true, data: { rooms: [] } });
  });

  it('akun tidak ada / hangus → tidak bisa connect, origin asing ditolak', async () => {
    const alice = await registered();
    await expect(TestSocket.open('0'.repeat(32))).rejects.toThrow(/404/);
    await expect(TestSocket.open(alice.userId, 'https://jahat.example')).rejects.toThrow(/403/);
    expect((await call('GET', `/v1/ws/${alice.userId}`)).status).toBe(400); // tanpa Upgrade
    await advanceClock(ACCOUNT.LIFETIME_MS);
    await expect(TestSocket.open(alice.userId)).rejects.toThrow(/404/);
  });
});

describe('alur pesan (PRD §6.3)', () => {
  it('A kirim saat B offline; B login kemudian dan menerima', async () => {
    const { alice, bob, room, a } = await pair();
    const op = sendOp(room);
    expect(await a.request(sendFrame(room, 'a', bob, op))).toMatchObject({
      ok: true,
      data: { seq: 1 },
    });

    const b = await TestSocket.connect(bob);
    const rooms = await b.request({ t: 'rooms' });
    expect(rooms).toMatchObject({
      ok: true,
      data: { rooms: [{ inboxRoomId: room.b.inboxRoomId, unread: 1 }] },
    });

    const synced = await b.request(syncFrame(room, 'b'));
    expect(synced.ok).toBe(true);
    const data = (synced.ok ? synced.data : null) as SyncResult;
    expect(data.messages).toEqual([
      {
        msgId: op.msgId,
        seq: 1,
        mine: false,
        ttl: 5,
        body: op.body,
        key: op.keyForPeer,
        chunks: 0,
      },
    ]);
    expect(data.ttl).toBe(5);

    const own = (await a.request(syncFrame(room, 'a'))) as { ok: true; data: SyncResult };
    expect(own.data.messages[0]).toMatchObject({ mine: true, key: op.keyForSelf });
    expect(alice.userId).not.toBe(bob.userId);
  });

  it('B online menerima event new seketika', async () => {
    const { bob, room, a } = await pair();
    const b = await TestSocket.connect(bob);
    await a.request(sendFrame(room, 'a', bob));
    expect(await b.next((f) => f.t === 'event')).toEqual({
      t: 'event',
      inboxRoomId: room.b.inboxRoomId,
      payload: { t: 'new', seq: 1 },
    });
  });

  it('socket yang belum terautentikasi tidak menerima event (tidak bisa mengintip kapan pesan masuk)', async () => {
    const { bob, room, a } = await pair();
    const spy = await TestSocket.open(bob.userId);
    await spy.next((f) => f.t === 'challenge');
    await a.request(sendFrame(room, 'a', bob));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(spy.pending()).toEqual([]);
  });

  it('sync(sinceSeq) hanya mengembalikan pesan setelah seq itu', async () => {
    const { bob, room, a } = await pair();
    for (let i = 0; i < 3; i++) await a.request(sendFrame(room, 'a', bob));
    const r = (await a.request(syncFrame(room, 'a', 2))) as { ok: true; data: SyncResult };
    expect(r.data.messages.map((m) => m.seq)).toEqual([3]);
  });

  it('opened: hanya penerima; timer mulai sekali; pengirim mendapat event opened', async () => {
    const { alice, bob, room, a } = await pair(5);
    const op = sendOp(room);
    await a.request(sendFrame(room, 'a', bob, op));
    const b = await TestSocket.connect(bob);

    expect(await a.request(openedFrame(room, 'a', bob, [op.msgId]))).toMatchObject({
      ok: false,
      error: 'forbidden',
    });

    const first = await b.request(openedFrame(room, 'b', alice, [op.msgId]));
    expect(first).toMatchObject({
      ok: true,
      data: { opened: [{ msgId: op.msgId, remainingMs: 5300 }] },
    });
    expect(await a.next((f) => f.t === 'event')).toEqual({
      t: 'event',
      inboxRoomId: room.a.inboxRoomId,
      payload: { t: 'opened', msgId: op.msgId, remainingMs: 5300 },
    });

    await advanceClock(2000);
    // burn_at tidak bergeser saat dibuka lagi; sisa waktu turun ~2 dtk (ditambah waktu nyata yang berjalan).
    const again = (await b.request(openedFrame(room, 'b', alice, [op.msgId]))) as {
      ok: true;
      data: { opened: { remainingMs: number }[] };
    };
    expect(again.data.opened[0]!.remainingMs).toBeGreaterThan(3000);
    expect(again.data.opened[0]!.remainingMs).toBeLessThanOrEqual(3300);
    const synced = (await a.request(syncFrame(room, 'a'))) as { ok: true; data: SyncResult };
    expect(synced.data.messages[0]?.remainingMs).toBeLessThanOrEqual(
      again.data.opened[0]!.remainingMs,
    );
  });

  it('alarm melebur pesan pada burn_at; sync tidak lagi mengembalikannya (PRD §6.2)', async () => {
    const { alice, bob, room, a } = await pair(3);
    const op = sendOp(room, { ttl: 3 });
    await a.request(sendFrame(room, 'a', bob, op));
    const b = await TestSocket.connect(bob);
    await b.request(openedFrame(room, 'b', alice, [op.msgId]));

    // burn_at = dibuka + 3000 + 300 ms. Margin 200 ms untuk waktu nyata yang berjalan selama test.
    await advanceClock(3100);
    expect(
      ((await b.request(syncFrame(room, 'b'))) as { ok: true; data: SyncResult }).data.messages,
    ).toHaveLength(1);
    await advanceClock(200);
    // Disaring walaupun alarm belum jalan…
    expect(
      ((await b.request(syncFrame(room, 'b'))) as { ok: true; data: SyncResult }).data.messages,
    ).toHaveLength(0);
    // …dan alarm benar-benar menghapus record.
    await runDurableObjectAlarm(roomStub(room.roomId));
    expect((await dumpSql(roomStub(room.roomId), ['messages'])).messages).toHaveLength(0);
  });

  it('pesan yang ditutup di tengah timer tetap terhapus (B menutup tab)', async () => {
    const { alice, bob, room, a } = await pair(10);
    const op = sendOp(room, { ttl: 10 });
    await a.request(sendFrame(room, 'a', bob, op));
    const b = await TestSocket.connect(bob);
    await b.request(openedFrame(room, 'b', alice, [op.msgId]));
    b.close();
    await advanceClock(10_300);
    await runDurableObjectAlarm(roomStub(room.roomId));
    expect(
      ((await a.request(syncFrame(room, 'a'))) as { ok: true; data: SyncResult }).data.messages,
    ).toEqual([]);
  });

  it('ttl record tidak melebihi timer room yang berlaku', async () => {
    const { bob, room, a } = await pair(3);
    await a.request(sendFrame(room, 'a', bob, sendOp(room, { ttl: 10 })));
    const r = (await a.request(syncFrame(room, 'a'))) as { ok: true; data: SyncResult };
    expect(r.data.messages[0]?.ttl).toBe(3);
  });

  it('purge menghapus semua pesan dan chunk', async () => {
    const { bob, room, a } = await pair();
    for (let i = 0; i < 3; i++) await a.request(sendFrame(room, 'a', bob));
    const b = await TestSocket.connect(bob);
    expect(await b.request(purgeFrame(room, 'b'))).toMatchObject({ ok: true });
    expect((await dumpSql(roomStub(room.roomId), ['messages', 'chunks'])).messages).toHaveLength(0);
  });

  it('rooms.setUnread dan rooms.forget hanya mengubah inbox sendiri', async () => {
    const { bob, room, a } = await pair();
    await a.request(sendFrame(room, 'a', bob));
    const b = await TestSocket.connect(bob);
    await b.request({ t: 'rooms.setUnread', inboxRoomId: room.b.inboxRoomId, n: 0 });
    expect(await b.request({ t: 'rooms' })).toMatchObject({ data: { rooms: [{ unread: 0 }] } });
    await b.request({ t: 'rooms.forget', inboxRoomId: room.b.inboxRoomId });
    expect(await b.request({ t: 'rooms' })).toMatchObject({ data: { rooms: [] } });
    expect(await a.request({ t: 'rooms' })).toMatchObject({
      data: { rooms: [{ inboxRoomId: room.a.inboxRoomId }] },
    });
    // Pesan berikutnya membawa header lagi → room muncul kembali di daftar B.
    const frame = { ...sendFrame(room, 'a', bob), sealedHeaderForPeer: b64(560) };
    await a.request(frame);
    expect(await b.request({ t: 'rooms' })).toMatchObject({
      data: { rooms: [{ inboxRoomId: room.b.inboxRoomId, unread: 1 }] },
    });
  });
});

describe('bukti member & anti-replay (PRD §4.6)', () => {
  it('proof salah, memberTag asing, dan op yang diubah ditolak', async () => {
    const { room, a } = await pair();
    const op = { kind: 'sync' as const, roomId: room.roomId, sinceSeq: 0 };
    const stranger = newRoom().a;
    const auth = authFor(room.a, op);
    for (const bad of [
      { ...auth, proof: b64(32) },
      authFor(stranger, op),
      authFor({ ...room.a, memberKey: room.b.memberKey }, op),
    ]) {
      expect(await a.request({ t: 'room.sync', op, auth: bad })).toMatchObject({
        ok: false,
        error: 'bad_proof',
      });
    }
    expect(await a.request({ t: 'room.sync', op: { ...op, sinceSeq: 1 }, auth })).toMatchObject({
      ok: false,
      error: 'bad_proof',
    });
  });

  it('opNonce yang sama ditolak sebagai replay', async () => {
    const { bob, room, a } = await pair();
    const frame = sendFrame(room, 'a', bob);
    expect(await a.request(frame)).toMatchObject({ ok: true });
    expect(await a.request(frame)).toMatchObject({ ok: false, error: 'replay' });
  });

  it('opNonce boleh dipakai lagi setelah 10 menit, tetapi msgId yang sama tetap ditolak', async () => {
    const { bob, room, a } = await pair();
    const frame = sendFrame(room, 'a', bob);
    await a.request(frame);
    await advanceClock(LIMITS.NONCE_WINDOW_MS + 1);
    expect(await a.request(frame)).toMatchObject({ ok: false, error: 'conflict' });
  });

  it('operasi pada room yang belum ada → not_found tanpa membuat storage', async () => {
    const alice = await registered();
    const a = await TestSocket.connect(alice);
    const room = newRoom();
    expect(await a.request(syncFrame(room, 'a'))).toMatchObject({ ok: false, error: 'not_found' });
    expect(await hasTables(roomStub(room.roomId))).toBe(false);
  });

  it('RoomDO menolak op yang roomId-nya bukan room ini', async () => {
    const { room } = await pair();
    const other = newRoom();
    const op = { kind: 'sync' as const, roomId: other.roomId, sinceSeq: 0 };
    expect(await roomStub(room.roomId).sync(op, authFor(room.a, op))).toEqual({
      ok: false,
      error: 'invalid',
    });
  });
});

describe('init room (PRD §6.2)', () => {
  it('mulai bersamaan dengan timer berbeda → room sama, timer yang pertama berlaku', async () => {
    const { alice, bob, room } = await pair(5);
    const b = await TestSocket.connect(bob);
    expect(await b.request(initFrame(room, 'b', alice, 3))).toMatchObject({
      ok: true,
      data: { ttl: 5, created: false },
    });
  });

  it('anggota berbeda → conflict', async () => {
    const { bob, room, a } = await pair();
    const hijack: TestRoom = { roomId: room.roomId, a: room.a, b: newRoom().b };
    expect(await a.request(initFrame(hijack, 'a', bob))).toMatchObject({
      ok: false,
      error: 'conflict',
    });
  });

  it('tidak bisa membuat room dengan diri sendiri atau akun yang tidak ada', async () => {
    const alice = await registered();
    const a = await TestSocket.connect(alice);
    expect(await a.request(initFrame(newRoom(), 'a', alice))).toMatchObject({
      ok: false,
      error: 'invalid',
    });
    const ghost = { ...alice, userId: '0'.repeat(32) } as TestAccount;
    expect(await a.request(initFrame(newRoom(), 'a', ghost))).toMatchObject({
      ok: false,
      error: 'not_found',
    });
  });

  it('expire_at room = floor_jam(min(umur A, umur B)), kelipatan jam', async () => {
    const early = await registered();
    await advanceClock(3 * HOUR + 1234);
    const late = await registered();
    const room = newRoom();
    const s = await TestSocket.connect(late);
    await s.request(initFrame(room, 'a', early));
    const rows = await env.DB.prepare(
      'SELECT user_id, expires_at FROM accounts WHERE user_id IN (?, ?)',
    )
      .bind(early.userId, late.userId)
      .all<{ expires_at: number }>();
    const minExpiry = Math.min(...rows.results.map((r) => r.expires_at));
    const settings = (await dumpSql(roomStub(room.roomId), ['settings'])).settings as {
      k: string;
      v: string;
    }[];
    const expireAt = Number(settings.find((r) => r.k === 'expire_at')?.v);
    expect(expireAt % HOUR).toBe(0);
    expect(expireAt).toBeLessThanOrEqual(minExpiry);
    expect(minExpiry - expireAt).toBeLessThan(HOUR);
  });
});

describe('batas (PRD §6.2, §6.4)', () => {
  it('maksimal 200 pesan tertunda per room → room_full', async () => {
    const { room } = await pair();
    const stub = roomStub(room.roomId);
    for (let i = 0; i < LIMITS.ROOM_MAX_PENDING_MESSAGES; i++) {
      const op = sendOp(room);
      expect((await stub.send(op, authFor(room.a, op))).ok).toBe(true);
    }
    const op = sendOp(room);
    expect(await stub.send(op, authFor(room.a, op))).toEqual({ ok: false, error: 'room_full' });
  });

  it('kirim maksimal 30 pesan per menit per akun', async () => {
    const { bob, room, a } = await pair();
    for (let i = 0; i < 30; i++)
      expect(await a.request(sendFrame(room, 'a', bob))).toMatchObject({ ok: true });
    expect(await a.request(sendFrame(room, 'a', bob))).toMatchObject({
      ok: false,
      error: 'rate_limited',
    });
  });
});

describe('umur akun & penjaga akun mati (PRD §5.3, §6.1)', () => {
  it('kirim ke akun hangus ditolak dan tidak membuat storage di InboxDO tujuan', async () => {
    const bob = await registered();
    await advanceClock(ACCOUNT.LIFETIME_MS - HOUR / 2);
    const alice = await registered();
    await advanceClock(HOUR);
    const a = await TestSocket.connect(alice);
    expect(await a.request(initFrame(newRoom(), 'a', bob))).toMatchObject({
      ok: false,
      error: 'not_found',
    });
    expect(await inbox(bob.userId).hasStorage()).toBe(false);
  });

  it('touch langsung ke inbox akun hangus → not_found dan storage dikosongkan', async () => {
    const bob = await registered();
    await TestSocket.connect(bob);
    expect(await inbox(bob.userId).hasStorage()).toBe(true);
    await advanceClock(ACCOUNT.LIFETIME_MS);
    expect(await inbox(bob.userId).touch(bob.userId, newRoom().b.inboxRoomId, b64(560), 1)).toEqual(
      { ok: false, error: 'not_found' },
    );
    expect(await hasTables(inbox(bob.userId))).toBe(false);
  });

  it('kirim ke lawan yang sudah hangus ditolak', async () => {
    const bob = await registered();
    await advanceClock(2 * HOUR);
    const alice = await registered();
    const room = newRoom();
    const a = await TestSocket.connect(alice);
    await a.request(initFrame(room, 'a', bob));
    await advanceClock(ACCOUNT.LIFETIME_MS - 2 * HOUR);
    const a2 = await TestSocket.connect(alice);
    expect(await a2.request(sendFrame(room, 'a', bob))).toMatchObject({
      ok: false,
      error: 'not_found',
    });
  });

  it('kirim ke lawan yang sudah menghapus akunnya ditolak, walau room masih hidup', async () => {
    const { bob, room, a } = await pair();
    const body = {
      userId: bob.userId,
      seq: 1,
      sig: await bob.signFields(LABELS.REQ_DELETE, { userId: bob.userId, seq: 1 }),
    };
    expect((await call('DELETE', '/v1/account', { body })).status).toBe(200);
    expect(await a.request(sendFrame(room, 'a', bob))).toMatchObject({
      ok: false,
      error: 'not_found',
    });
    expect((await dumpSql(roomStub(room.roomId), ['messages'])).messages).toHaveLength(0);
    expect(await hasTables(inbox(bob.userId))).toBe(false);
  });

  it('setelah 72 jam: socket ditutup 4410, InboxDO kosong, RoomDO dihapus seluruhnya', async () => {
    const { bob, room, a } = await pair();
    await a.request(sendFrame(room, 'a', bob));
    await advanceClock(ACCOUNT.LIFETIME_MS);
    a.sendRaw(JSON.stringify({ t: 'rooms', reqId: 99 }));
    expect((await a.closed).code).toBe(WS.CLOSE.EXPIRED);
    await runDurableObjectAlarm(inbox(bob.userId));
    expect(await hasTables(inbox(bob.userId))).toBe(false);
    await runDurableObjectAlarm(roomStub(room.roomId));
    expect(await hasTables(roomStub(room.roomId))).toBe(false);
  });

  it('hapus akun menutup socket aktif', async () => {
    const { alice, a } = await pair();
    await inbox(alice.userId).destroy();
    expect((await a.closed).code).toBe(1000);
  });
});

describe('privasi storage (PRD §12 aturan 3, 4; D-001)', () => {
  it('RoomDO tanpa identitas, InboxDO tanpa waktu, tidak ada nilai bersama antar-inbox', async () => {
    const { alice, bob, room, a } = await pair();
    const op: SendOp = sendOp(room);
    await a.request(sendFrame(room, 'a', bob, op));
    const b = await TestSocket.connect(bob);
    await b.request(openedFrame(room, 'b', alice, [op.msgId]));

    const roomDump = JSON.stringify(
      await dumpSql(roomStub(room.roomId), [
        'members',
        'settings',
        'messages',
        'chunks',
        'used_nonces',
      ]),
    );
    for (const secret of [
      alice.userId,
      bob.userId,
      alice.username,
      bob.username,
      alice.register.edPk,
      bob.register.edPk,
      alice.register.xPk,
      bob.register.xPk,
    ]) {
      expect(roomDump).not.toContain(secret);
    }

    const columns = (stub: DurableObjectStub) =>
      runInDurableObject(stub, async (_i, state) =>
        state.storage.sql
          .exec("SELECT name FROM pragma_table_info('rooms')")
          .toArray()
          .map((r) => r['name']),
      );
    expect(await columns(inbox(alice.userId))).toEqual(['room_id', 'sealed_header', 'unread']);
    const messageColumns = await runInDurableObject(roomStub(room.roomId), async (_i, state) =>
      state.storage.sql
        .exec("SELECT name FROM pragma_table_info('messages')")
        .toArray()
        .map((r) => r['name']),
    );
    expect(messageColumns).not.toContain('kind');
    expect(messageColumns).not.toContain('created_at');

    const ids = async (userId: string) =>
      ((await dumpSql(inbox(userId), ['rooms'])).rooms as { room_id: string }[]).map(
        (r) => r.room_id,
      );
    const aliceIds = await ids(alice.userId);
    const bobIds = await ids(bob.userId);
    expect(aliceIds).toEqual([room.a.inboxRoomId]);
    expect(bobIds).toEqual([room.b.inboxRoomId]);
    expect(aliceIds.filter((id) => bobIds.includes(id))).toEqual([]);
    expect([...aliceIds, ...bobIds]).not.toContain(room.roomId);
    const inboxDump = JSON.stringify(await dumpSql(inbox(alice.userId), ['rooms']));
    expect(inboxDump).not.toContain(bob.userId);
    expect(base64urlEncode(new Uint8Array(0))).toBe('');
  });
});

describe('batalkan pesan (PRD §6.2, §7.4)', () => {
  it('pengirim membatalkan: record & chunk hilang, lawan menerima event retracted', async () => {
    const { alice, bob, room, a } = await pair();
    const op = sendOp(room);
    await a.request(sendFrame(room, 'a', bob, op));
    const b = await TestSocket.connect(bob);
    expect(await a.request(retractFrame(room, 'a', bob, op.msgId))).toMatchObject({ ok: true });
    expect(await b.next((f) => f.t === 'event')).toEqual({
      t: 'event',
      inboxRoomId: room.b.inboxRoomId,
      payload: { t: 'retracted', msgId: op.msgId },
    });
    expect((await dumpSql(roomStub(room.roomId), ['messages'])).messages).toHaveLength(0);
    expect(alice.userId).toBeTruthy();
  });

  it('hanya pengirim yang bisa membatalkan; pesan tak dikenal → not_found', async () => {
    const { alice, bob, room, a } = await pair();
    const op = sendOp(room);
    await a.request(sendFrame(room, 'a', bob, op));
    const b = await TestSocket.connect(bob);
    expect(await b.request(retractFrame(room, 'b', alice, op.msgId))).toMatchObject({
      ok: false,
      error: 'forbidden',
    });
    expect(await a.request(retractFrame(room, 'a', bob, b64(16)))).toMatchObject({
      ok: false,
      error: 'not_found',
    });
    expect((await dumpSql(roomStub(room.roomId), ['messages'])).messages).toHaveLength(1);
  });

  it('pesan yang sudah dibuka tetap bisa dibatalkan selama belum melebur', async () => {
    const { alice, bob, room, a } = await pair(10);
    const op = sendOp(room, { ttl: 10 });
    await a.request(sendFrame(room, 'a', bob, op));
    const b = await TestSocket.connect(bob);
    await b.request(openedFrame(room, 'b', alice, [op.msgId]));
    expect(await a.request(retractFrame(room, 'a', bob, op.msgId))).toMatchObject({ ok: true });
    await advanceClock(10_300);
    expect(await a.request(retractFrame(room, 'a', bob, sendOp(room).msgId))).toMatchObject({
      ok: false,
      error: 'not_found',
    });
  });

  it('pesan yang sudah melebur tidak bisa dibatalkan', async () => {
    const { alice, bob, room, a } = await pair(3);
    const op = sendOp(room, { ttl: 3 });
    await a.request(sendFrame(room, 'a', bob, op));
    const b = await TestSocket.connect(bob);
    await b.request(openedFrame(room, 'b', alice, [op.msgId]));
    await advanceClock(3_400);
    expect(await a.request(retractFrame(room, 'a', bob, op.msgId))).toMatchObject({
      ok: false,
      error: 'not_found',
    });
  });
});

describe('kesepakatan timer (PRD §7.3)', () => {
  it('usulan → lawan setuju → timer berubah; kedua pihak diberi tahu', async () => {
    const { alice, bob, room, a } = await pair(5);
    const b = await TestSocket.connect(bob);
    expect(await a.request(ttlFrame(room, 'a', bob, 'propose', 3))).toMatchObject({
      ok: true,
      data: { ttl: 5 },
    });
    expect(await b.next((f) => f.t === 'event')).toMatchObject({
      payload: { t: 'ttl_proposed', ttl: 3 },
    });

    const synced = (await b.request(syncFrame(room, 'b'))) as { ok: true; data: SyncResult };
    expect(synced.data).toMatchObject({ ttl: 5, pendingTtl: { ttl: 3, mine: false } });
    const own = (await a.request(syncFrame(room, 'a'))) as { ok: true; data: SyncResult };
    expect(own.data.pendingTtl).toEqual({ ttl: 3, mine: true });

    expect(await b.request(ttlFrame(room, 'b', alice, 'accept', 3))).toMatchObject({
      ok: true,
      data: { ttl: 3 },
    });
    expect(await a.next((f) => f.t === 'event')).toMatchObject({
      payload: { t: 'ttl_changed', ttl: 3 },
    });
    const after = (await a.request(syncFrame(room, 'a'))) as { ok: true; data: SyncResult };
    expect(after.data.ttl).toBe(3);
    expect(after.data.pendingTtl).toBeUndefined();
  });

  it('pengusul tidak bisa menyetujui usulannya sendiri; timer belum berubah', async () => {
    const { bob, room, a } = await pair(5);
    await a.request(ttlFrame(room, 'a', bob, 'propose', 10));
    expect(await a.request(ttlFrame(room, 'a', bob, 'accept', 10))).toMatchObject({
      ok: false,
      error: 'forbidden',
    });
    const r = (await a.request(syncFrame(room, 'a'))) as { ok: true; data: SyncResult };
    expect(r.data.ttl).toBe(5);
  });

  it('menjawab nilai yang sudah berganti → conflict; tolak membersihkan usulan', async () => {
    const { alice, bob, room, a } = await pair(5);
    const b = await TestSocket.connect(bob);
    await a.request(ttlFrame(room, 'a', bob, 'propose', 3));
    await a.request(ttlFrame(room, 'a', bob, 'propose', 7));
    expect(await b.request(ttlFrame(room, 'b', alice, 'accept', 3))).toMatchObject({
      ok: false,
      error: 'conflict',
    });
    expect(await b.request(ttlFrame(room, 'b', alice, 'reject', 7))).toMatchObject({
      ok: true,
      data: { ttl: 5 },
    });
    expect(await a.next((f) => f.t === 'event' && f.payload.t === 'ttl_rejected')).toMatchObject({
      payload: { t: 'ttl_rejected', ttl: 7 },
    });
    const r = (await a.request(syncFrame(room, 'a'))) as { ok: true; data: SyncResult };
    expect(r.data).toMatchObject({ ttl: 5 });
    expect(r.data.pendingTtl).toBeUndefined();
    expect(await b.request(ttlFrame(room, 'b', alice, 'accept', 7))).toMatchObject({
      ok: false,
      error: 'conflict',
    });
  });

  it('usulan yang sama dengan timer berlaku ditolak', async () => {
    const { bob, room, a } = await pair(5);
    expect(await a.request(ttlFrame(room, 'a', bob, 'propose', 5))).toMatchObject({
      ok: false,
      error: 'invalid',
    });
  });
});

describe('gambar: chunk terenkripsi (PRD §4.5, §6.2, §13.2)', () => {
  async function imageMessage(chunks = 2) {
    const ctx = await pair(5);
    const op = sendOp(ctx.room, { chunks });
    expect(await ctx.a.request(sendFrame(ctx.room, 'a', ctx.bob, op))).toMatchObject({
      ok: true,
      data: { seq: 1 },
    });
    return { ...ctx, op };
  }

  it('lawan baru diberi tahu setelah chunk terakhir; chunk bisa diunduh kedua pihak', async () => {
    const { alice, bob, room, a, op } = await imageMessage(2);
    const b = await TestSocket.connect(bob);
    // Belum lengkap: belum muncul di sync lawan, belum ada event.
    expect(
      ((await b.request(syncFrame(room, 'b'))) as { ok: true; data: SyncResult }).data.messages,
    ).toEqual([]);
    expect(
      await a.requestChunk(chunkHeader(room, 'a', bob, op.msgId, 0), chunkData(1)),
    ).toMatchObject({ ok: true, data: { complete: false } });
    expect(b.pending().filter((f) => f.t === 'event')).toEqual([]);
    expect(
      await a.requestChunk(chunkHeader(room, 'a', bob, op.msgId, 1), chunkData(2)),
    ).toMatchObject({ ok: true, data: { complete: true } });
    expect(await b.next((f) => f.t === 'event')).toEqual({
      t: 'event',
      inboxRoomId: room.b.inboxRoomId,
      payload: { t: 'new', seq: 1 },
    });

    const synced = (await b.request(syncFrame(room, 'b'))) as { ok: true; data: SyncResult };
    expect(synced.data.messages[0]).toMatchObject({ msgId: op.msgId, chunks: 2 });
    const got = await b.request(getChunkFrame(room, 'b', op.msgId, 1));
    expect(got).toMatchObject({ ok: true, data: { data: base64urlEncode(chunkData(2)) } });
    expect(await a.request(getChunkFrame(room, 'a', op.msgId, 0))).toMatchObject({ ok: true });
    expect(alice.userId).toBeTruthy();
  });

  it('semua chunk tersimpan berukuran identik; ukuran lain ditolak sebagai frame rusak', async () => {
    const { bob, room, a, op } = await imageMessage(1);
    await a.requestChunk(chunkHeader(room, 'a', bob, op.msgId, 0), chunkData());
    const sizes = (await dumpSql(roomStub(room.roomId), ['chunks'])).chunks!.map(
      (c) => (c as { data: ArrayBuffer }).data.byteLength,
    );
    expect(sizes).toEqual([IMAGE_CIPHER_CHUNK_BYTES]);

    const other = await imageMessage(1);
    other.a.sendRaw(
      encodeChunkFrame(
        { ...chunkHeader(other.room, 'a', other.bob, other.op.msgId, 0), reqId: 99 },
        new Uint8Array(1000),
      ).buffer as ArrayBuffer,
    );
    expect((await other.a.closed).code).toBe(WS.CLOSE.PROTOCOL_ERROR);
  });

  it('hanya pengirim yang bisa mengunggah; idx di luar jumlah chunk & duplikat ditolak', async () => {
    const { alice, bob, room, a, op } = await imageMessage(1);
    const b = await TestSocket.connect(bob);
    expect(
      await b.requestChunk(chunkHeader(room, 'b', alice, op.msgId, 0), chunkData()),
    ).toMatchObject({ ok: false, error: 'forbidden' });
    expect(
      await a.requestChunk(chunkHeader(room, 'a', bob, op.msgId, 1), chunkData()),
    ).toMatchObject({ ok: false, error: 'invalid' });
    expect(
      await a.requestChunk(chunkHeader(room, 'a', bob, op.msgId, 0), chunkData()),
    ).toMatchObject({ ok: true, data: { complete: true } });
    expect(
      await a.requestChunk(chunkHeader(room, 'a', bob, op.msgId, 0), chunkData()),
    ).toMatchObject({ ok: false, error: 'not_found' });
  });

  it('frame biner sebelum autentikasi ditutup 4401', async () => {
    const alice = await registered();
    const s = await TestSocket.open(alice.userId);
    await s.next((f) => f.t === 'challenge');
    s.sendRaw(new Uint8Array(10).buffer);
    expect((await s.closed).code).toBe(WS.CLOSE.UNAUTHORIZED);
  });

  it('upload yang terputus dihapus otomatis setelah 10 menit', async () => {
    const { bob, room, a, op } = await imageMessage(2);
    await a.requestChunk(chunkHeader(room, 'a', bob, op.msgId, 0), chunkData());
    await advanceClock(LIMITS.UPLOAD_DEADLINE_MS + 1);
    await runDurableObjectAlarm(roomStub(room.roomId));
    const dump = await dumpSql(roomStub(room.roomId), ['messages', 'chunks']);
    expect(dump.messages).toEqual([]);
    expect(dump.chunks).toEqual([]);
  });

  it('chunk pesan yang sudah melebur tidak bisa diunduh', async () => {
    const { alice, bob, room, a, op } = await imageMessage(1);
    await a.requestChunk(chunkHeader(room, 'a', bob, op.msgId, 0), chunkData());
    const b = await TestSocket.connect(bob);
    await b.request(openedFrame(room, 'b', alice, [op.msgId]));
    await advanceClock(5_300);
    expect(await b.request(getChunkFrame(room, 'b', op.msgId, 0))).toMatchObject({
      ok: false,
      error: 'not_found',
    });
  });

  it('membatalkan saat upload menghapus record dan chunk yang sudah masuk', async () => {
    const { bob, room, a, op } = await imageMessage(3);
    await a.requestChunk(chunkHeader(room, 'a', bob, op.msgId, 0), chunkData());
    expect(await a.request(retractFrame(room, 'a', bob, op.msgId))).toMatchObject({ ok: true });
    const dump = await dumpSql(roomStub(room.roomId), ['messages', 'chunks']);
    expect(dump.messages).toEqual([]);
    expect(dump.chunks).toEqual([]);
  });

  it('kuota 150 MB per akun → quota_exceeded', async () => {
    const { alice, bob, room, a, op } = await imageMessage(1);
    await runInDurableObject(inbox(alice.userId), async (_i, state) => {
      state.storage.kv.put('uploaded_bytes', LIMITS.ACCOUNT_UPLOAD_QUOTA_BYTES - 100);
    });
    expect(
      await a.requestChunk(chunkHeader(room, 'a', bob, op.msgId, 0), chunkData()),
    ).toMatchObject({ ok: false, error: 'quota_exceeded' });
  });

  it('total chunk per room maks 30 MB → room_full', async () => {
    const { bob, room, a, op } = await imageMessage(1);
    await runInDurableObject(roomStub(room.roomId), async (_i, state) => {
      // Isi room dengan chunk pesan lain sampai hampir penuh (blob SQLite maks ±2 MB, jadi per 1 MB).
      const MB = 1024 * 1024;
      let left = LIMITS.ROOM_MAX_CHUNK_BYTES - 1000;
      for (let i = 0; left > 0; i++) {
        const size = Math.min(MB, left);
        state.storage.sql.exec(
          'INSERT INTO chunks (msg_id, idx, data) VALUES (?, ?, ?)',
          'pengisi',
          i,
          new Uint8Array(size),
        );
        left -= size;
      }
    });
    expect(
      await a.requestChunk(chunkHeader(room, 'a', bob, op.msgId, 0), chunkData()),
    ).toMatchObject({ ok: false, error: 'room_full' });
  });
});
