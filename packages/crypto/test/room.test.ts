import {
  HEADER,
  IMAGE,
  IMAGE_CIPHER_CHUNK_BYTES,
  LABELS,
  MESSAGE,
  base64urlDecode,
  base64urlEncode,
  canonicalJson,
  concatBytes,
  hexDecode,
  hexEncode,
  u32,
  utf8Encode,
  type Inner,
  type RoomHeader,
  type SendOp,
} from '@blackchat/protocol';
import sodiumModule from 'libsodium-wrappers-sumo';
import { describe, expect, it } from 'vitest';
import {
  CryptoError,
  aeadEncrypt,
  decryptImage,
  decryptMessage,
  deriveRoom,
  effectiveTtl,
  encryptImage,
  encryptMessage,
  generateIdentity,
  identityFromSeeds,
  memberProof,
  memberTagFor,
  newContentKey,
  newMsgId,
  opHash,
  openHeader,
  pad,
  ready,
  roomAuth,
  sealHeader,
  sealTo,
  signInner,
  verifyInner,
  verifyMemberProof,
  wipeRoomKeys,
  type Identity,
} from '../src/index.js';
import base from './vectors.json' with { type: 'json' };
import vectors from './vectors-room.json' with { type: 'json' };

await ready();

const b = base64urlDecode;
const h = hexDecode;
const alice = identityFromSeeds(h(base.alice.edSeed), h(base.alice.xSeed));
const bob = identityFromSeeds(h(base.bob.edSeed), h(base.bob.xSeed));
const carol = generateIdentity();

const roomOf = (me: Identity, peer: Identity) => deriveRoom(me.xSk, peer.xPk, me.edPk, peer.edPk);

function textInner(from: Identity, roomId: string, overrides: Partial<Inner> = {}): Inner {
  return signInner(from.edSk, {
    v: 1,
    kind: 'text',
    msgId: newMsgId(),
    roomId,
    fromEdPk: base64urlEncode(from.edPk),
    ttl: 5,
    ts: 1_800_000_000_000,
    text: 'halo',
    ...overrides,
  });
}

describe('room tanpa identitas anggota (PRD §4.6, D-001)', () => {
  it('kedua sisi menghitung nilai yang sama, cocok dengan vektor independen', () => {
    const a = roomOf(alice, bob);
    const c = roomOf(bob, alice);
    expect(hexEncode(a.shared)).toBe(vectors.room.shared);
    expect(a.roomId).toBe(vectors.room.roomId);
    expect(c.roomId).toBe(a.roomId);
    expect(a.myInboxRoomId).toBe(vectors.room.alice.inboxRoomId);
    expect(a.peerInboxRoomId).toBe(vectors.room.bob.inboxRoomId);
    expect(c.myInboxRoomId).toBe(a.peerInboxRoomId);
    expect(c.peerInboxRoomId).toBe(a.myInboxRoomId);
    expect(base64urlEncode(a.myMemberKey)).toBe(vectors.room.alice.memberKey);
    expect(base64urlEncode(a.peerMemberKey)).toBe(vectors.room.bob.memberKey);
    expect(a.myMemberTag).toBe(vectors.room.alice.memberTag);
    expect(a.peerMemberTag).toBe(vectors.room.bob.memberTag);
    expect(c.myMemberTag).toBe(a.peerMemberTag);
    expect(memberTagFor(a.myMemberKey)).toBe(a.myMemberTag);
  });

  it('roomId dan kedua inboxRoomId berbeda satu sama lain (D-001)', () => {
    const a = roomOf(alice, bob);
    expect(new Set([a.roomId, a.myInboxRoomId, a.peerInboxRoomId]).size).toBe(3);
    expect(a.myMemberTag).not.toBe(a.peerMemberTag);
  });

  it('pihak ketiga tidak bisa menghitung room yang sama', () => {
    const ab = roomOf(alice, bob);
    for (const r of [roomOf(carol, bob), roomOf(carol, alice), roomOf(alice, carol)]) {
      expect(r.roomId).not.toBe(ab.roomId);
      expect(r.myInboxRoomId).not.toBe(ab.myInboxRoomId);
      expect(r.myInboxRoomId).not.toBe(ab.peerInboxRoomId);
    }
  });

  it('menolak kunci publik berorde rendah dan room dengan diri sendiri', () => {
    expect(() => deriveRoom(alice.xSk, new Uint8Array(32), alice.edPk, bob.edPk)).toThrow(
      CryptoError,
    );
    const order1 = new Uint8Array(32);
    order1[0] = 1;
    expect(() => deriveRoom(alice.xSk, order1, alice.edPk, bob.edPk)).toThrow(CryptoError);
    expect(() => deriveRoom(alice.xSk, bob.xPk, alice.edPk, alice.edPk)).toThrow(CryptoError);
    expect(() => deriveRoom(alice.xSk, bob.xPk.subarray(1), alice.edPk, bob.edPk)).toThrow(
      CryptoError,
    );
  });

  it('wipeRoomKeys mengosongkan rahasia', () => {
    const r = roomOf(alice, bob);
    wipeRoomKeys(r);
    for (const secret of [r.shared, r.myMemberKey, r.peerMemberKey])
      expect(secret.every((x) => x === 0)).toBe(true);
  });
});

describe('bukti member (PRD §4.6, D-009)', () => {
  const op = vectors.proof.op as SendOp;

  it('opHash & proof cocok dengan vektor independen', () => {
    expect(canonicalJson(op)).toBe(vectors.proof.opCanonical);
    expect(hexEncode(opHash(op))).toBe(vectors.proof.opHash);
    const proof = memberProof(
      b(vectors.room.alice.memberKey),
      b(vectors.proof.opNonce),
      opHash(op),
    );
    expect(base64urlEncode(proof)).toBe(vectors.proof.proof);
  });

  it('opHash tidak bergantung pada urutan kunci objek', () => {
    const reordered = Object.fromEntries(Object.entries(op).reverse()) as unknown as SendOp;
    expect(hexEncode(opHash(reordered))).toBe(vectors.proof.opHash);
  });

  it('roomAuth menghasilkan bukti valid dengan opNonce baru tiap kali', () => {
    const r = roomOf(alice, bob);
    const a1 = roomAuth(r, op);
    const a2 = roomAuth(r, op);
    expect(a1.memberTag).toBe(r.myMemberTag);
    expect(a1.opNonce).not.toBe(a2.opNonce);
    expect(verifyMemberProof(r.myMemberKey, b(a1.opNonce), op, b(a1.proof))).toBe(true);
  });

  it('bukti ditolak dengan memberKey lain, opNonce lain, atau op yang diubah', () => {
    const r = roomOf(alice, bob);
    const auth = roomAuth(r, op);
    const nonce = b(auth.opNonce);
    const proof = b(auth.proof);
    expect(verifyMemberProof(r.peerMemberKey, nonce, op, proof)).toBe(false);
    expect(verifyMemberProof(roomOf(carol, bob).myMemberKey, nonce, op, proof)).toBe(false);
    expect(verifyMemberProof(r.myMemberKey, new Uint8Array(16), op, proof)).toBe(false);
    expect(verifyMemberProof(r.myMemberKey, nonce, { ...op, ttl: 3 }, proof)).toBe(false);
    expect(verifyMemberProof(r.myMemberKey, nonce, { ...op, chunks: 1 }, proof)).toBe(false);
    expect(verifyMemberProof(r.myMemberKey, nonce, op, proof.subarray(1))).toBe(false);
  });
});

describe('header tersegel (PRD §6.1, D-009)', () => {
  const headerFor = (peer: Identity, username: string): RoomHeader => ({
    v: 1,
    peerUserId: peer.userId,
    peerUsername: username,
    peerEdPk: base64urlEncode(peer.edPk),
    peerXPk: base64urlEncode(peer.xPk),
    peerXPkSig: base64urlEncode(peer.xPkSig),
    peerExpiresAt: 500_000 * 3_600_000,
  });

  it('membuka vektor independen', () => {
    expect(openHeader(alice.xPk, alice.xSk, b(vectors.header.sealedForAlice))).toEqual(
      vectors.header.plain,
    );
  });

  it('ukuran selalu sama berapa pun panjang username', () => {
    for (const name of ['abc', 'a'.repeat(20)]) {
      const sealed = sealHeader(alice.xPk, headerFor(bob, name));
      expect(sealed.length).toBe(HEADER.SEALED_BYTES);
      expect(openHeader(alice.xPk, alice.xSk, sealed).peerUsername).toBe(name);
    }
  });

  it('hanya pemilik yang bisa membuka', () => {
    const sealed = sealHeader(alice.xPk, headerFor(bob, 'rara'));
    expect(() => openHeader(carol.xPk, carol.xSk, sealed)).toThrow(CryptoError);
  });

  it('menolak header yang tidak konsisten (userId atau xPkSig palsu)', () => {
    const wrongUser = sealHeader(alice.xPk, {
      ...headerFor(bob, 'rara'),
      peerUserId: carol.userId,
    });
    expect(() => openHeader(alice.xPk, alice.xSk, wrongUser)).toThrow(/userId/);
    const swappedXPk = sealHeader(alice.xPk, {
      ...headerFor(bob, 'rara'),
      peerXPk: base64urlEncode(carol.xPk),
    });
    expect(() => openHeader(alice.xPk, alice.xSk, swappedXPk)).toThrow(/xPk/);
  });

  it('menolak header yang formatnya salah', () => {
    expect(() => sealHeader(alice.xPk, { ...headerFor(bob, 'rara'), peerExpiresAt: 1 })).toThrow(
      CryptoError,
    );
    expect(() => openHeader(alice.xPk, alice.xSk, new Uint8Array(HEADER.SEALED_BYTES - 1))).toThrow(
      CryptoError,
    );
  });
});

describe('pesan (PRD §4.5, §4.7)', () => {
  const r = roomOf(alice, bob);
  const v = vectors.message;
  const expectFromAlice = { fromEdPk: alice.edPk, roomId: r.roomId, msgId: v.inner.msgId };

  it('vektor independen: B membuka dengan keyForPeer, A dengan keyForSelf', () => {
    const asBob = decryptMessage({
      body: b(v.body),
      key: b(v.keyForPeer),
      myXPk: bob.xPk,
      myXSk: bob.xSk,
      expected: expectFromAlice,
    });
    expect(asBob.inner).toEqual(v.inner);
    expect(hexEncode(asBob.contentKey)).toBe(v.contentKey);
    const asAlice = decryptMessage({
      body: b(v.body),
      key: b(v.keyForSelf),
      myXPk: alice.xPk,
      myXSk: alice.xSk,
      expected: expectFromAlice,
    });
    expect(asAlice.inner.text).toBe(v.inner.text);
  });

  it('pihak ketiga tidak bisa membuka', () => {
    expect(() =>
      decryptMessage({
        body: b(v.body),
        key: b(v.keyForPeer),
        myXPk: carol.xPk,
        myXSk: carol.xSk,
        expected: expectFromAlice,
      }),
    ).toThrow(CryptoError);
  });

  it('menolak jika pengirim yang diharapkan berbeda, atau roomId/msgId record tidak cocok', () => {
    const args = { body: b(v.body), key: b(v.keyForPeer), myXPk: bob.xPk, myXSk: bob.xSk };
    expect(() =>
      decryptMessage({ ...args, expected: { ...expectFromAlice, fromEdPk: carol.edPk } }),
    ).toThrow(CryptoError);
    expect(() =>
      decryptMessage({ ...args, expected: { ...expectFromAlice, msgId: newMsgId() } }),
    ).toThrow(CryptoError);
    expect(() =>
      decryptMessage({
        ...args,
        expected: { ...expectFromAlice, roomId: roomOf(carol, bob).roomId },
      }),
    ).toThrow(CryptoError);
  });

  it('round-trip; body selalu AEAD + kelipatan 256', () => {
    for (const text of ['a', 'x'.repeat(300), '😀'.repeat(MESSAGE.TEXT_MAX_CHARS)]) {
      const inner = textInner(alice, r.roomId, { text });
      const contentKey = newContentKey();
      const sent = encryptMessage({ inner, contentKey, myXPk: alice.xPk, peerXPk: bob.xPk });
      expect((sent.body.length - 40) % MESSAGE.TEXT_PAD_BLOCK).toBe(0);
      expect(sent.keyForPeer.length).toBe(80);
      const got = decryptMessage({
        body: sent.body,
        key: sent.keyForPeer,
        myXPk: bob.xPk,
        myXSk: bob.xSk,
        expected: { fromEdPk: alice.edPk, roomId: r.roomId, msgId: inner.msgId },
      });
      expect(got.inner).toEqual(inner);
    }
  });

  it('Carol tidak bisa menyamar sebagai Alice', () => {
    // Inner yang mengaku dari Alice tetapi ditandatangani Carol.
    const forged = textInner(carol, r.roomId, { fromEdPk: base64urlEncode(alice.edPk) });
    expect(
      verifyInner(forged, { fromEdPk: alice.edPk, roomId: r.roomId, msgId: forged.msgId }),
    ).toBe(false);
    // Inner jujur dari Carol, dikirim lewat room Alice–Bob: pengirimnya bukan lawan Bob.
    const honest = textInner(carol, r.roomId);
    const key = newContentKey();
    const sent = encryptMessage({
      inner: honest,
      contentKey: key,
      myXPk: carol.xPk,
      peerXPk: bob.xPk,
    });
    expect(() =>
      decryptMessage({
        body: sent.body,
        key: sent.keyForPeer,
        myXPk: bob.xPk,
        myXSk: bob.xSk,
        expected: { fromEdPk: alice.edPk, roomId: r.roomId, msgId: honest.msgId },
      }),
    ).toThrow(/PRD §4.7/);
  });

  it('menolak Inner bertanda tangan sah dari room/msgId lain yang dibungkus ulang dengan AAD benar', () => {
    // Pengirim curang: Inner asli Alice untuk room lain (atau msgId lain) dienkripsi dengan AAD room ini.
    const other = roomOf(alice, carol);
    for (const inner of [textInner(alice, other.roomId), textInner(alice, r.roomId)]) {
      const msgId = inner.roomId === r.roomId ? newMsgId() : inner.msgId;
      const key = newContentKey();
      const body = aeadEncrypt(
        key,
        pad(utf8Encode(canonicalJson(inner)), MESSAGE.TEXT_PAD_BLOCK),
        concatBytes(utf8Encode(LABELS.MSG), h(r.roomId), b(msgId)),
      );
      expect(verifyInner(inner, { fromEdPk: alice.edPk, roomId: r.roomId, msgId })).toBe(false);
      expect(() =>
        decryptMessage({
          body,
          key: sealTo(bob.xPk, key),
          myXPk: bob.xPk,
          myXSk: bob.xSk,
          expected: { fromEdPk: alice.edPk, roomId: r.roomId, msgId },
        }),
      ).toThrow(/PRD §4.7/);
    }
  });

  it('menolak Inner yang diubah setelah ditandatangani', () => {
    const inner = textInner(alice, r.roomId);
    const expected = { fromEdPk: alice.edPk, roomId: r.roomId, msgId: inner.msgId };
    expect(verifyInner(inner, expected)).toBe(true);
    expect(verifyInner({ ...inner, text: 'diubah' }, expected)).toBe(false);
    expect(verifyInner({ ...inner, ttl: 10 }, expected)).toBe(false);
  });

  it('menolak isi yang bukan Inner valid walaupun terenkripsi dengan benar', () => {
    const msgId = newMsgId();
    const key = newContentKey();
    const body = aeadEncrypt(
      key,
      pad(utf8Encode('{"v":1}'), MESSAGE.TEXT_PAD_BLOCK),
      concatBytes(utf8Encode(LABELS.MSG), h(r.roomId), b(msgId)),
    );
    expect(() =>
      decryptMessage({
        body,
        key: sealTo(bob.xPk, key),
        myXPk: bob.xPk,
        myXSk: bob.xSk,
        expected: { fromEdPk: alice.edPk, roomId: r.roomId, msgId },
      }),
    ).toThrow(/Inner tidak valid/);
  });

  it('signInner menolak Inner yang tidak valid', () => {
    expect(() => textInner(alice, r.roomId, { text: '' })).toThrow(CryptoError);
    expect(() => textInner(alice, r.roomId, { ttl: 4 as 5 })).toThrow(CryptoError);
  });

  it('effectiveTtl = min (PRD §7.3)', () => {
    expect(effectiveTtl(10, 3)).toBe(3);
    expect(effectiveTtl(3, 10)).toBe(3);
    expect(effectiveTtl(5, 5)).toBe(5);
  });
});

describe('gambar (PRD §4.5 langkah 3)', () => {
  const r = roomOf(alice, bob);
  const random = (n: number): Uint8Array => sodiumModule.randombytes_buf(n);

  it('semua chunk berukuran identik untuk gambar kecil maupun besar', () => {
    const key = newContentKey();
    const sizes = new Set<number>();
    for (const n of [10, 262_143, 262_144, 1_400_000, IMAGE.OUTPUT_MAX_BYTES]) {
      const img = encryptImage(random(n), key, r.roomId, newMsgId());
      expect(img.chunks.length).toBe(Math.ceil((n + 1) / IMAGE.CHUNK_BYTES));
      for (const chunk of img.chunks) sizes.add(chunk.length);
    }
    expect([...sizes]).toEqual([IMAGE_CIPHER_CHUNK_BYTES]);
  });

  it('round-trip dan hash cocok', () => {
    const key = newContentKey();
    const msgId = newMsgId();
    const bytes = random(300_000);
    const img = encryptImage(bytes, key, r.roomId, msgId);
    const meta = { chunks: img.chunks.length, bytes: img.bytes, hash: img.hash };
    expect(decryptImage(img.chunks, key, r.roomId, msgId, meta)).toEqual(bytes);
  });

  it('chunk 0 bisa dibuka libsodium mentah dengan AAD sesuai spesifikasi', () => {
    const key = newContentKey();
    const msgId = newMsgId();
    const img = encryptImage(random(100), key, r.roomId, msgId);
    const chunk = img.chunks[0]!;
    const aad = concatBytes(utf8Encode('bc-img-v1'), h(r.roomId), b(msgId), u32(0));
    const plain = sodiumModule.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      chunk.subarray(24),
      aad,
      chunk.subarray(0, 24),
      key,
    );
    expect(plain.length).toBe(IMAGE.CHUNK_BYTES);
  });

  it('menolak chunk tertukar, room/msgId lain, hash atau ukuran yang tidak cocok', () => {
    const key = newContentKey();
    const msgId = newMsgId();
    const img = encryptImage(random(600_000), key, r.roomId, msgId);
    const meta = { chunks: img.chunks.length, bytes: img.bytes, hash: img.hash };
    const [c0, c1, c2] = img.chunks as [Uint8Array, Uint8Array, Uint8Array];
    expect(() => decryptImage([c1, c0, c2], key, r.roomId, msgId, meta)).toThrow(CryptoError);
    expect(() => decryptImage(img.chunks, key, r.roomId, newMsgId(), meta)).toThrow(CryptoError);
    expect(() => decryptImage(img.chunks, newContentKey(), r.roomId, msgId, meta)).toThrow(
      CryptoError,
    );
    expect(() =>
      decryptImage(img.chunks, key, r.roomId, msgId, {
        ...meta,
        hash: base64urlEncode(new Uint8Array(32)),
      }),
    ).toThrow(/hash/);
    expect(() =>
      decryptImage(img.chunks, key, r.roomId, msgId, { ...meta, bytes: meta.bytes - 1 }),
    ).toThrow(/ukuran/);
    expect(() => decryptImage([c0, c1], key, r.roomId, msgId, meta)).toThrow(/jumlah/);
    expect(() => decryptImage([c0, c1, c2.subarray(1)], key, r.roomId, msgId, meta)).toThrow(
      /ukuran chunk/,
    );
  });

  it('menolak gambar kosong atau melebihi 1,5 MB', () => {
    const key = newContentKey();
    expect(() => encryptImage(new Uint8Array(0), key, r.roomId, newMsgId())).toThrow(CryptoError);
    expect(() =>
      encryptImage(new Uint8Array(IMAGE.OUTPUT_MAX_BYTES + 1), key, r.roomId, newMsgId()),
    ).toThrow(CryptoError);
  });

  it('pesan gambar lengkap: Inner + chunk dengan contentKey yang sama', () => {
    const key = newContentKey();
    const msgId = newMsgId();
    const bytes = random(50_000);
    const img = encryptImage(bytes, key, r.roomId, msgId);
    const inner = signInner(alice.edSk, {
      v: 1,
      kind: 'image',
      msgId,
      roomId: r.roomId,
      fromEdPk: base64urlEncode(alice.edPk),
      ttl: 7,
      ts: 1_800_000_000_000,
      text: 'caption',
      image: {
        w: 800,
        h: 600,
        mime: 'image/webp',
        chunks: img.chunks.length,
        bytes: img.bytes,
        hash: img.hash,
      },
    });
    const sent = encryptMessage({ inner, contentKey: key, myXPk: alice.xPk, peerXPk: bob.xPk });
    const got = decryptMessage({
      body: sent.body,
      key: sent.keyForPeer,
      myXPk: bob.xPk,
      myXSk: bob.xSk,
      expected: { fromEdPk: alice.edPk, roomId: r.roomId, msgId },
    });
    expect(decryptImage(img.chunks, got.contentKey, r.roomId, msgId, got.inner.image!)).toEqual(
      bytes,
    );
  });
});
