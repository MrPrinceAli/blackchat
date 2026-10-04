import { describe, expect, it } from 'vitest';
import {
  AEAD_OVERHEAD,
  CONTACTS,
  HEADER,
  LIMITS,
  MESSAGE,
  REQ_ID_MAX,
  RESULT_DATA,
  base64urlEncode,
  clientFrame,
  contactList,
  initOp,
  inner,
  innerImage,
  int,
  lookupResponse,
  openedOp,
  parseClientFrame,
  parseServerFrame,
  registerRequest,
  roomHeader,
  serverFrame,
  syncedMessage,
  text,
  vBody,
  vContactsBlob,
  vEdPk,
  vReqId,
  vTtl,
  vUserId,
  vUsername,
  type Validator,
} from '../src/index.js';
import { b64, cases, HOUR, MY_INBOX, ops, PEER_ID, USER_ID, auth } from './fixtures.js';

const accepts = (validate: Validator<unknown>, input: unknown): boolean => validate(input).ok;

/** Nilai dengan tipe JS berbeda dari contoh valid. */
function wrongTypes(valid: unknown): unknown[] {
  if (valid === null) return ['x', 1, {}];
  if (Array.isArray(valid)) return [null, {}, 'x', 1];
  switch (typeof valid) {
    case 'string':
      return [null, 1, true, [], {}];
    case 'number':
      return [null, String(valid), true, [], {}, 0.5, Number.NaN, Number.POSITIVE_INFINITY, -1];
    case 'boolean':
      return [null, 1, 'true', 0];
    case 'object':
      return [null, 'x', 1, [], true];
    default:
      return [null];
  }
}

describe.each(cases)(
  '$name',
  ({ validator, valid, optional = [], anyValue = [], nullable = [] }) => {
    it('menerima contoh valid dan mengembalikan salinan yang sama', () => {
      const r = validator(structuredClone(valid));
      expect(r).toEqual({ ok: true, value: valid });
    });

    it('menolak input bukan objek', () => {
      for (const input of [null, undefined, 'x', 1, true, [], [valid]]) {
        expect(accepts(validator, input)).toBe(false);
      }
    });

    it('menolak field asing', () => {
      expect(accepts(validator, { ...valid, extra: 1 })).toBe(false);
      expect(
        accepts(validator, JSON.parse(`{"__proto__":{"x":1},${JSON.stringify(valid).slice(1)}`)),
      ).toBe(false);
    });

    it.each(Object.keys(valid))('field "%s" hilang', (key) => {
      const { [key]: _removed, ...rest } = valid;
      expect(accepts(validator, rest)).toBe(optional.includes(key));
    });

    it.each(Object.keys(valid).filter((k) => !anyValue.includes(k)))(
      'field "%s" bertipe salah',
      (key) => {
        for (const wrong of wrongTypes(valid[key]).filter(
          (w) => !(w === null && nullable.includes(key)),
        )) {
          expect(accepts(validator, { ...valid, [key]: wrong }), `${key} = ${String(wrong)}`).toBe(
            false,
          );
        }
      },
    );
  },
);

describe('nilai dasar', () => {
  it('username', () => {
    for (const ok of ['abc', 'a_b_c', 'user_2026', 'a'.repeat(20)])
      expect(accepts(vUsername, ok)).toBe(true);
    for (const bad of ['ab', 'a'.repeat(21), 'Rara', 'ra-ra', 'ra ra', 'rára', 'rara\n', '']) {
      expect(accepts(vUsername, bad), bad).toBe(false);
    }
  });

  it('userId hanya base32 Crockford kanonik 32 karakter', () => {
    expect(accepts(vUserId, USER_ID)).toBe(true);
    for (const bad of [
      USER_ID.slice(1),
      `${USER_ID}0`,
      USER_ID.toLowerCase(),
      `${USER_ID.slice(0, 31)}I`,
      `${USER_ID.slice(0, 31)}L`,
      `${USER_ID.slice(0, 31)}O`,
      `${USER_ID.slice(0, 31)}U`,
    ]) {
      expect(accepts(vUserId, bad), bad).toBe(false);
    }
  });

  it('kunci base64url harus tepat ukurannya dan kanonik', () => {
    expect(accepts(vEdPk, b64(32))).toBe(true);
    expect(accepts(vEdPk, b64(31))).toBe(false);
    expect(accepts(vEdPk, b64(33))).toBe(false);
    expect(accepts(vEdPk, `${b64(32)}=`)).toBe(false);
    expect(accepts(vEdPk, b64(32).replace(/.$/, 'B'))).toBe(false); // bit sisa tidak nol
    expect(accepts(vEdPk, `+${b64(32).slice(1)}`)).toBe(false);
  });

  it('body pesan: AEAD + kelipatan 256, maks 64 blok', () => {
    expect(accepts(vBody, b64(AEAD_OVERHEAD + 256))).toBe(true);
    expect(accepts(vBody, b64(AEAD_OVERHEAD + 64 * 256))).toBe(true);
    expect(accepts(vBody, b64(AEAD_OVERHEAD + 255))).toBe(false);
    expect(accepts(vBody, b64(AEAD_OVERHEAD))).toBe(false);
    expect(accepts(vBody, b64(AEAD_OVERHEAD + 65 * 256))).toBe(false);
  });

  it('blob kontak: AEAD + kelipatan 4 KB, maks 8 blok', () => {
    expect(accepts(vContactsBlob, b64(AEAD_OVERHEAD + CONTACTS.PAD_BLOCK))).toBe(true);
    expect(accepts(vContactsBlob, b64(AEAD_OVERHEAD + 8 * CONTACTS.PAD_BLOCK))).toBe(true);
    expect(accepts(vContactsBlob, b64(AEAD_OVERHEAD + CONTACTS.PAD_BLOCK + 1))).toBe(false);
    expect(accepts(vContactsBlob, b64(AEAD_OVERHEAD + 9 * CONTACTS.PAD_BLOCK))).toBe(false);
  });

  it('bilangan bulat ketat', () => {
    const v = int(0, 10);
    for (const ok of [0, 10, 5]) expect(accepts(v, ok)).toBe(true);
    for (const bad of [-0, -1, 11, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '1', 2 ** 53]) {
      expect(accepts(v, bad), String(bad)).toBe(false);
    }
  });

  it('ttl hanya 3/5/7/10', () => {
    for (const ok of MESSAGE.TTL_OPTIONS) expect(accepts(vTtl, ok)).toBe(true);
    for (const bad of [0, 4, 6, 11, '5', 5.0001]) expect(accepts(vTtl, bad)).toBe(false);
  });

  it('reqId 1 … 2^31 − 1', () => {
    expect(accepts(vReqId, 1)).toBe(true);
    expect(accepts(vReqId, REQ_ID_MAX)).toBe(true);
    expect(accepts(vReqId, 0)).toBe(false);
    expect(accepts(vReqId, REQ_ID_MAX + 1)).toBe(false);
  });

  it('teks dihitung per code point dan menolak surrogate tunggal', () => {
    const v = text(1, 3);
    expect(accepts(v, '😀😀😀')).toBe(true); // 6 code unit, 3 code point
    expect(accepts(v, '😀😀😀😀')).toBe(false);
    expect(accepts(v, '\uD800')).toBe(false);
    expect(accepts(v, 'a\uDC00')).toBe(false);
    expect(accepts(v, '')).toBe(false);
  });
});

describe('aturan semantik', () => {
  it('init menolak dua anggota dengan memberTag sama', () => {
    const [first] = ops.init.members;
    expect(accepts(initOp, { ...ops.init, members: [first, first] })).toBe(false);
    expect(accepts(initOp, { ...ops.init, members: [first] })).toBe(false);
  });

  it('room.init menolak inboxRoomId sendiri = lawan', () => {
    const frame = cases.find((c) => c.name === 'room.init')!.valid;
    expect(accepts(clientFrame, { ...frame, peerInboxRoomId: MY_INBOX })).toBe(false);
  });

  it('opened: 1–10 msgId unik', () => {
    const id = (n: number): string => base64urlEncode(new Uint8Array(16).fill(n));
    expect(accepts(openedOp, { ...ops.opened, msgIds: [] })).toBe(false);
    expect(accepts(openedOp, { ...ops.opened, msgIds: [id(1), id(1)] })).toBe(false);
    const ten = Array.from({ length: MESSAGE.OPENED_MAX_IDS }, (_, i) => id(i));
    expect(accepts(openedOp, { ...ops.opened, msgIds: ten })).toBe(true);
    expect(accepts(openedOp, { ...ops.opened, msgIds: [...ten, id(99)] })).toBe(false);
  });

  it('op yang tertukar jenisnya ditolak', () => {
    const sync = cases.find((c) => c.name === 'room.sync')!.valid;
    expect(accepts(clientFrame, { ...sync, op: ops.purge })).toBe(false);
  });

  it('sendOp: chunks 0 … 7', () => {
    const send = cases.find((c) => c.name === 'room.send')!.valid;
    expect(accepts(clientFrame, { ...send, op: { ...ops.send, chunks: 7 } })).toBe(true);
    expect(accepts(clientFrame, { ...send, op: { ...ops.send, chunks: 8 } })).toBe(false);
  });

  it('expiresAt publik harus kelipatan jam', () => {
    const valid = cases.find((c) => c.name === 'lookupResponse')!.valid;
    expect(accepts(lookupResponse, { ...valid, expiresAt: 500_000 * HOUR + 1 })).toBe(false);
    const header = cases.find((c) => c.name === 'roomHeader')!.valid;
    expect(accepts(roomHeader, { ...header, peerExpiresAt: 480_000 * HOUR - 1 })).toBe(false);
  });

  it('inner teks: wajib teks tidak kosong, tanpa gambar, maks 2000 karakter', () => {
    const valid = cases.find((c) => c.name === 'inner text')!.valid;
    const image = cases.find((c) => c.name === 'inner image')!.valid['image'];
    expect(accepts(inner, { ...valid, text: '' })).toBe(false);
    expect(accepts(inner, { ...valid, image })).toBe(false);
    expect(accepts(inner, { ...valid, text: '😀'.repeat(MESSAGE.TEXT_MAX_CHARS) })).toBe(true);
    expect(accepts(inner, { ...valid, text: 'a'.repeat(MESSAGE.TEXT_MAX_CHARS + 1) })).toBe(false);
    expect(accepts(inner, { ...valid, text: '<img src=x onerror=alert(1)>' })).toBe(true);
  });

  it('inner gambar: wajib image, caption maks 300', () => {
    const valid = cases.find((c) => c.name === 'inner image')!.valid;
    const { image: _image, ...noImage } = valid;
    expect(accepts(inner, noImage)).toBe(false);
    expect(accepts(inner, { ...valid, text: 'a'.repeat(MESSAGE.CAPTION_MAX_CHARS) })).toBe(true);
    expect(accepts(inner, { ...valid, text: 'a'.repeat(MESSAGE.CAPTION_MAX_CHARS + 1) })).toBe(
      false,
    );
  });

  it('inner gambar: jumlah chunk harus cocok dengan ukuran setelah padding', () => {
    const base = { w: 10, h: 10, mime: 'image/jpeg', hash: b64(32) };
    expect(accepts(innerImage, { ...base, bytes: 262_143, chunks: 1 })).toBe(true);
    // Tepat 256 KB → sodium_pad menambah satu blok penuh.
    expect(accepts(innerImage, { ...base, bytes: 262_144, chunks: 1 })).toBe(false);
    expect(accepts(innerImage, { ...base, bytes: 262_144, chunks: 2 })).toBe(true);
    expect(accepts(innerImage, { ...base, bytes: 1_572_864, chunks: 7 })).toBe(true);
    expect(accepts(innerImage, { ...base, bytes: 1_572_865, chunks: 7 })).toBe(false);
    expect(accepts(innerImage, { ...base, bytes: 100, chunks: 1, mime: 'image/png' })).toBe(false);
    expect(accepts(innerImage, { ...base, bytes: 100, chunks: 1, w: 1601 })).toBe(false);
  });

  it('daftar kontak menolak userId berulang', () => {
    const c = cases.find((x) => x.name === 'contact')!.valid;
    expect(accepts(contactList, [c, { ...c, userId: USER_ID }])).toBe(true);
    expect(accepts(contactList, [c, { ...c, username: 'lain' }])).toBe(false);
    expect(accepts(contactList, [])).toBe(true);
  });

  it('result error hanya menerima kode error yang dikenal', () => {
    expect(accepts(serverFrame, { t: 'result', reqId: 1, ok: false, error: 'kacau' })).toBe(false);
    expect(
      accepts(serverFrame, { t: 'result', reqId: 1, ok: false, error: 'room_full', data: {} }),
    ).toBe(false);
  });

  it('data result kosong menolak isi apa pun', () => {
    expect(accepts(RESULT_DATA['room.purge'], {})).toBe(true);
    expect(accepts(RESULT_DATA['room.purge'], { x: 1 })).toBe(false);
    expect(accepts(RESULT_DATA['room.purge'], [])).toBe(false);
  });

  it('pesan sync hanya membawa satu kunci', () => {
    const m = cases.find((c) => c.name === 'syncedMessage')!.valid;
    expect(accepts(syncedMessage, { ...m, keyForPeer: m['key'] })).toBe(false);
  });

  it('header tersegel harus tepat satu blok', () => {
    const frame = cases.find((c) => c.name === 'room.init')!.valid;
    expect(
      accepts(clientFrame, { ...frame, sealedHeaderForPeer: b64(HEADER.SEALED_BYTES + 1) }),
    ).toBe(false);
  });
});

describe('parseClientFrame / parseServerFrame', () => {
  const sync = JSON.stringify({ t: 'room.sync', reqId: 4, op: ops.sync, auth });

  it('menerima frame valid', () => {
    expect(parseClientFrame(sync).ok).toBe(true);
    expect(parseServerFrame(JSON.stringify({ t: 'pong' })).ok).toBe(true);
  });

  it('menolak JSON rusak, jenis tak dikenal, dan t hilang', () => {
    for (const raw of [
      '',
      '{',
      'null',
      '[]',
      '"x"',
      '{"t":"nope","reqId":1}',
      '{"reqId":1}',
      '{"t":1}',
    ]) {
      expect(parseClientFrame(raw).ok, raw).toBe(false);
    }
  });

  it('menolak frame melebihi batas ukuran', () => {
    const big = JSON.stringify({
      t: 'rooms',
      reqId: 1,
      pad: 'x'.repeat(LIMITS.WS_JSON_FRAME_MAX_BYTES),
    });
    const r = parseClientFrame(big);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('terlalu besar');
  });

  it('menolak frame server ke arah client (dan sebaliknya)', () => {
    expect(parseClientFrame(JSON.stringify({ t: 'pong' })).ok).toBe(false);
    expect(parseServerFrame(sync).ok).toBe(false);
  });

  it('pesan error menyebut lokasi field', () => {
    const r = registerRequest({ ...cases[0]!.valid, edPk: b64(31) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^\.edPk: /);
  });

  it('userId lawan di route divalidasi', () => {
    const frame = cases.find((c) => c.name === 'room.opened')!.valid;
    expect(accepts(clientFrame, { ...frame, peerUserId: PEER_ID.toLowerCase() })).toBe(false);
  });
});
