import { createPublicKey, verify as nodeVerify } from 'node:crypto';
import { argon2id } from '@noble/hashes/argon2.js';
import { blake2b as nobleBlake2b } from '@noble/hashes/blake2.js';
import {
  AEAD_OVERHEAD,
  CONTACTS,
  LABELS,
  base32CrockfordEncode,
  base64urlDecode,
  base64urlEncode,
  hexDecode,
  hexEncode,
  utf8Encode,
  VAULT_BYTES,
  type Contact,
} from '@blackchat/protocol';
import { describe, expect, it } from 'vitest';
import {
  CryptoError,
  aeadDecrypt,
  aeadEncrypt,
  checkPasswordPolicy,
  deriveKeys,
  equalBytes,
  generateIdentity,
  identityFromSecretKeys,
  identityFromSeeds,
  newMsgId,
  newOpNonce,
  newSalt,
  newTabId,
  openContacts,
  openVault,
  pad,
  ready,
  safetyNumber,
  sealContacts,
  sealOpen,
  sealTo,
  sealVault,
  signFields,
  signWsChallenge,
  unpad,
  userIdFromEdPk,
  verify,
  verifyFields,
  verifyXPk,
  wipe,
  wipeIdentity,
} from '../src/index.js';
import vectors from './vectors.json' with { type: 'json' };

const b = base64urlDecode;
const h = hexDecode;

// Top-level await: beberapa describe membuat identitas saat test dikumpulkan.
await ready();

function nodeEd25519Verify(edPk: Uint8Array, message: Uint8Array, sig: Uint8Array): boolean {
  const key = createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: base64urlEncode(edPk) },
    format: 'jwk',
  });
  return nodeVerify(null, message, key, sig);
}

const flip = (bytes: Uint8Array, index: number): Uint8Array => {
  if (index < 0 || index >= bytes.length)
    throw new RangeError(`indeks ${index} di luar ${bytes.length} byte`);
  const copy = bytes.slice();
  copy[index] = copy[index]! ^ 1;
  return copy;
};

describe('vektor uji tetap (test/vectors.json, dihitung tanpa src/)', () => {
  const alice = vectors.alice;

  it('password → authKey & vaultKey (PRD §4.3, D-002)', () => {
    const keys = deriveKeys(vectors.password.password, h(vectors.password.salt));
    expect(hexEncode(keys.authKey)).toBe(vectors.password.authKey);
    expect(hexEncode(keys.vaultKey)).toBe(vectors.password.vaultKey);
  });

  it('identitas dari seed (PRD §4.2)', () => {
    for (const v of [vectors.alice, vectors.bob]) {
      const id = identityFromSeeds(h(v.edSeed), h(v.xSeed));
      expect(base64urlEncode(id.edPk)).toBe(v.edPk);
      expect(base64urlEncode(id.edSk)).toBe(v.edSk);
      expect(base64urlEncode(id.xPk)).toBe(v.xPk);
      expect(base64urlEncode(id.xSk)).toBe(v.xSk);
      expect(base64urlEncode(id.xPkSig)).toBe(v.xPkSig);
      expect(id.userId).toBe(v.userId);
    }
  });

  it('identitas bisa dibangun ulang dari kunci rahasia vault', () => {
    const id = identityFromSecretKeys(b(alice.edSk), b(alice.xSk));
    expect(base64urlEncode(id.edPk)).toBe(alice.edPk);
    expect(base64urlEncode(id.xPk)).toBe(alice.xPk);
    expect(id.userId).toBe(alice.userId);
  });

  it('membuka vault dengan nonce tetap', () => {
    const { edSk, xSk } = openVault(h(vectors.password.vaultKey), b(vectors.vault));
    expect(base64urlEncode(edSk)).toBe(alice.edSk);
    expect(base64urlEncode(xSk)).toBe(alice.xSk);
  });

  it('membuka blob kontak', () => {
    expect(openContacts(h(vectors.password.vaultKey), b(vectors.contacts.blob))).toEqual(
      vectors.contacts.list,
    );
  });

  it('tanda tangan request dan challenge WS deterministik', () => {
    const edSk = b(alice.edSk);
    expect(base64urlEncode(signFields(edSk, LABELS.REQ_DELETE, vectors.deleteRequest.fields))).toBe(
      vectors.deleteRequest.sig,
    );
    expect(base64urlEncode(signWsChallenge(edSk, alice.userId, h(vectors.wsChallenge.nonce)))).toBe(
      vectors.wsChallenge.sig,
    );
  });

  it('safety number', () => {
    expect(safetyNumber(b(alice.edPk), b(vectors.bob.edPk))).toEqual(vectors.safetyNumber);
  });
});

describe('pemeriksaan silang dengan implementasi independen', () => {
  it('Argon2id + BLAKE2b libsodium sama dengan @noble/hashes', () => {
    const master = argon2id(
      utf8Encode(vectors.password.password.normalize('NFC')),
      h(vectors.password.salt),
      {
        t: 3,
        m: 64 * 1024,
        p: 1,
        dkLen: 64,
      },
    );
    const authKey = nobleBlake2b(utf8Encode(LABELS.AUTH), { key: master, dkLen: 32 });
    const vaultKey = nobleBlake2b(utf8Encode(LABELS.VAULT), { key: master, dkLen: 32 });
    expect(hexEncode(authKey)).toBe(vectors.password.authKey);
    expect(hexEncode(vaultKey)).toBe(vectors.password.vaultKey);
  }, 60_000);

  it('userId = base32(BLAKE2b-160(edPk)) sama dengan @noble/hashes', () => {
    const edPk = b(vectors.alice.edPk);
    expect(base32CrockfordEncode(nobleBlake2b(edPk, { dkLen: 20 }))).toBe(vectors.alice.userId);
    expect(userIdFromEdPk(edPk)).toBe(vectors.alice.userId);
  });

  it('tanda tangan Ed25519 lolos verifikasi node:crypto', () => {
    const id = generateIdentity();
    const message = utf8Encode('bc-req-contacts-v1{"seq":1}');
    expect(
      nodeEd25519Verify(id.edPk, message, signFields(id.edSk, 'bc-req-contacts-v1', { seq: 1 })),
    ).toBe(true);
    expect(
      nodeEd25519Verify(id.edPk, new Uint8Array([...utf8Encode(LABELS.XPK), ...id.xPk]), id.xPkSig),
    ).toBe(true);
  });
});

describe('password → kunci', () => {
  const salt = newSalt();

  it('salt berbeda → kunci berbeda; authKey ≠ vaultKey', () => {
    const a = deriveKeys('password panjang sekali', salt);
    const c = deriveKeys('password panjang sekali', newSalt());
    expect(equalBytes(a.authKey, a.vaultKey)).toBe(false);
    expect(equalBytes(a.authKey, c.authKey)).toBe(false);
    expect(equalBytes(a.vaultKey, c.vaultKey)).toBe(false);
  });

  it('password dinormalisasi NFC (D-010)', () => {
    const composed = deriveKeys('kafeé manis sekali', salt);
    const decomposed = deriveKeys('kafeé manis sekali', salt);
    expect(equalBytes(composed.authKey, decomposed.authKey)).toBe(true);
  });

  it('menolak salt bukan 16 byte dan password kosong', () => {
    expect(() => deriveKeys('x', new Uint8Array(15))).toThrow(CryptoError);
    expect(() => deriveKeys('', salt)).toThrow(CryptoError);
  });

  it('kebijakan password (PRD §4.3)', () => {
    expect(checkPasswordPolicy('rara', 'pendek123')).toBe('too_short');
    expect(checkPasswordPolicy('rara', '😀😀😀😀😀😀😀😀😀')).toBe('too_short'); // 9 code point
    expect(checkPasswordPolicy('rara_panjang', 'RARA_PANJANG')).toBe('same_as_username');
    expect(checkPasswordPolicy('rara', 'qwertyuiop')).toBe('common');
    expect(checkPasswordPolicy('rara', 'QwertyUiop')).toBe('common');
    expect(checkPasswordPolicy('rara', '1234567890')).toBe('common');
    expect(checkPasswordPolicy('rara', 'kuda lumping 2026')).toBeNull();
    expect(checkPasswordPolicy('rara', '😀😀😀😀😀😀😀😀😀😀')).toBeNull();
  });
});

describe('AEAD', () => {
  const key = new Uint8Array(32).fill(5);
  const plaintext = utf8Encode('rahasia');

  it('round-trip, nonce acak, format nonce || ct || tag', () => {
    const a = aeadEncrypt(key, plaintext, 'aad');
    const c = aeadEncrypt(key, plaintext, 'aad');
    expect(a.length).toBe(AEAD_OVERHEAD + plaintext.length);
    expect(equalBytes(a, c)).toBe(false);
    expect(aeadDecrypt(key, a, 'aad')).toEqual(plaintext);
  });

  it('gagal dengan kunci, AAD, nonce, atau ciphertext yang diubah', () => {
    const box = aeadEncrypt(key, plaintext, 'aad');
    expect(() => aeadDecrypt(new Uint8Array(32), box, 'aad')).toThrow(CryptoError);
    expect(() => aeadDecrypt(key, box, 'lain')).toThrow(CryptoError);
    expect(() => aeadDecrypt(key, flip(box, 0), 'aad')).toThrow(CryptoError);
    expect(() => aeadDecrypt(key, flip(box, box.length - 1), 'aad')).toThrow(CryptoError);
    expect(() => aeadDecrypt(key, box.subarray(0, 30), 'aad')).toThrow(CryptoError);
    expect(() => aeadEncrypt(new Uint8Array(31), plaintext, 'aad')).toThrow(CryptoError);
  });
});

describe('vault', () => {
  it('round-trip, ukuran tetap, gagal dengan kunci salah atau bit diubah', () => {
    const id = generateIdentity();
    const vaultKey = new Uint8Array(32).fill(1);
    const vault = sealVault(vaultKey, id.edSk, id.xSk);
    expect(vault.length).toBe(VAULT_BYTES);
    const opened = openVault(vaultKey, vault);
    expect(equalBytes(opened.edSk, id.edSk)).toBe(true);
    expect(equalBytes(opened.xSk, id.xSk)).toBe(true);
    expect(() => openVault(new Uint8Array(32).fill(2), vault)).toThrow(CryptoError);
    expect(() => openVault(vaultKey, flip(vault, 50))).toThrow(CryptoError);
    expect(() => openVault(vaultKey, vault.subarray(1))).toThrow(CryptoError);
  });

  it('vault dari AAD lain (blob kontak) tidak bisa dibuka sebagai vault', () => {
    const vaultKey = new Uint8Array(32).fill(1);
    const forged = aeadEncrypt(vaultKey, new Uint8Array(96), LABELS.CONTACTS_BLOB);
    expect(() => openVault(vaultKey, forged)).toThrow(CryptoError);
  });
});

describe('sealed box', () => {
  it('round-trip; hanya pemilik kunci yang bisa membuka', () => {
    const a = generateIdentity();
    const c = generateIdentity();
    const box = sealTo(a.xPk, utf8Encode('kunci konten'));
    expect(sealOpen(a.xPk, a.xSk, box)).toEqual(utf8Encode('kunci konten'));
    expect(() => sealOpen(c.xPk, c.xSk, box)).toThrow(CryptoError);
    expect(() => sealOpen(a.xPk, a.xSk, flip(box, 50))).toThrow(CryptoError);
    expect(() => sealOpen(a.xPk, a.xSk, box.subarray(0, 40))).toThrow(CryptoError);
    expect(() => sealTo(new Uint8Array(31), new Uint8Array(1))).toThrow(CryptoError);
  });
});

describe('padding', () => {
  it('hasil selalu kelipatan blok dan menambah ≥ 1 byte', () => {
    for (const n of [0, 1, 255, 256, 257, 511]) {
      const padded = pad(new Uint8Array(n).fill(9), 256);
      expect(padded.length % 256).toBe(0);
      expect(padded.length).toBeGreaterThan(n);
      expect(unpad(padded, 256)).toEqual(new Uint8Array(n).fill(9));
    }
  });

  it('menolak padding rusak dan panjang yang bukan kelipatan blok', () => {
    expect(() => unpad(new Uint8Array(256), 256)).toThrow(CryptoError); // tanpa penanda 0x80
    expect(() => unpad(new Uint8Array(255), 256)).toThrow(CryptoError);
    expect(() => unpad(new Uint8Array(0), 256)).toThrow(CryptoError);
    const bad = new Uint8Array(256);
    bad[100] = 0x80;
    bad[200] = 0x01; // byte bukan nol setelah penanda
    expect(() => unpad(bad, 256)).toThrow(CryptoError);
  });
});

describe('tanda tangan', () => {
  const id = identityFromSeeds(h(vectors.alice.edSeed), h(vectors.alice.xSeed));

  it('verifyXPk menolak xPk yang ditukar atau tanda tangan pihak lain', () => {
    const other = generateIdentity();
    expect(verifyXPk(id.edPk, id.xPk, id.xPkSig)).toBe(true);
    expect(verifyXPk(id.edPk, other.xPk, id.xPkSig)).toBe(false);
    expect(verifyXPk(other.edPk, id.xPk, id.xPkSig)).toBe(false);
    expect(verifyXPk(id.edPk, id.xPk, flip(id.xPkSig, 3))).toBe(false);
  });

  it('signFields memakai canonical JSON: urutan kunci tidak berpengaruh', () => {
    const sig = signFields(id.edSk, LABELS.REQ_CONTACTS, { b: 1, a: 2 });
    expect(verifyFields(id.edPk, LABELS.REQ_CONTACTS, { a: 2, b: 1 }, sig)).toBe(true);
    expect(verifyFields(id.edPk, LABELS.REQ_PASSWORD, { a: 2, b: 1 }, sig)).toBe(false);
    expect(verifyFields(id.edPk, LABELS.REQ_CONTACTS, { a: 2, b: 2 }, sig)).toBe(false);
  });

  it('verify mengembalikan false untuk ukuran tidak valid, bukan exception', () => {
    expect(verify(new Uint8Array(31), new Uint8Array(1), new Uint8Array(64))).toBe(false);
    expect(verify(id.edPk, new Uint8Array(1), new Uint8Array(63))).toBe(false);
  });

  it('challenge WS menolak nonce bukan 32 byte', () => {
    expect(() => signWsChallenge(id.edSk, id.userId, new Uint8Array(16))).toThrow(CryptoError);
  });
});

describe('blob kontak (PRD §4.8)', () => {
  const vaultKey = new Uint8Array(32).fill(3);
  const contact = (i: number): Contact => ({
    userId: base32CrockfordEncode(new Uint8Array(20).fill(i)),
    edPk: base64urlEncode(new Uint8Array(32).fill(i)),
    username: `kontak_${i}`,
    verified: i % 2 === 0,
    blocked: false,
  });

  it('ukuran tidak mencerminkan jumlah kontak (kelipatan 4 KB)', () => {
    const sizes = [0, 1, 5, 15].map(
      (n) =>
        sealContacts(
          vaultKey,
          Array.from({ length: n }, (_, i) => contact(i)),
        ).length,
    );
    expect(new Set(sizes)).toEqual(new Set([AEAD_OVERHEAD + CONTACTS.PAD_BLOCK]));
  });

  it('round-trip', () => {
    const list = [contact(1), contact(2)];
    expect(openContacts(vaultKey, sealContacts(vaultKey, list))).toEqual(list);
  });

  it('menolak daftar tidak valid dan daftar melebihi 8 blok', () => {
    expect(() => sealContacts(vaultKey, [contact(1), contact(1)])).toThrow(CryptoError);
    expect(() => sealContacts(vaultKey, [{ ...contact(1), username: 'X' }])).toThrow(CryptoError);
    const tooMany = Array.from({ length: 250 }, (_, i) => contact(i));
    expect(() => sealContacts(vaultKey, tooMany)).toThrow(CryptoError);
  });

  it('menolak blob dengan isi bukan daftar kontak valid', () => {
    const junk = aeadEncrypt(
      vaultKey,
      pad(utf8Encode('{"x":1}'), CONTACTS.PAD_BLOCK),
      LABELS.CONTACTS_BLOB,
    );
    expect(() => openContacts(vaultKey, junk)).toThrow(CryptoError);
    const notJson = aeadEncrypt(
      vaultKey,
      pad(utf8Encode('bukan json'), CONTACTS.PAD_BLOCK),
      LABELS.CONTACTS_BLOB,
    );
    expect(() => openContacts(vaultKey, notJson)).toThrow(CryptoError);
  });
});

describe('safety number (PRD §4.4)', () => {
  it('simetris, 12 grup × 5 digit, berbeda untuk pasangan berbeda', () => {
    const a = generateIdentity();
    const c = generateIdentity();
    const d = generateIdentity();
    const ac = safetyNumber(a.edPk, c.edPk);
    expect(safetyNumber(c.edPk, a.edPk)).toEqual(ac);
    expect(ac).toHaveLength(12);
    for (const group of ac) expect(group).toMatch(/^\d{5}$/);
    expect(safetyNumber(a.edPk, d.edPk)).not.toEqual(ac);
  });
});

describe('id acak & util', () => {
  it('ukuran dan keunikan', () => {
    const ids = new Set(Array.from({ length: 100 }, () => newMsgId()));
    expect(ids.size).toBe(100);
    expect(b(newMsgId())).toHaveLength(16);
    expect(b(newTabId())).toHaveLength(16);
    expect(newOpNonce()).toHaveLength(16);
  });

  it('wipe mengosongkan buffer; equalBytes constant-time & peka panjang', () => {
    const secret = new Uint8Array([1, 2, 3]);
    wipe(secret, undefined, null);
    expect(secret).toEqual(new Uint8Array(3));
    expect(equalBytes(new Uint8Array([1]), new Uint8Array([1, 0]))).toBe(false);
    expect(equalBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
  });

  it('wipeIdentity mengosongkan kunci rahasia', () => {
    const id = generateIdentity();
    wipeIdentity(id);
    expect(id.edSk.every((x) => x === 0)).toBe(true);
    expect(id.xSk.every((x) => x === 0)).toBe(true);
  });
});
