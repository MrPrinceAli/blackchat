import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  EncodingError,
  base32CrockfordDecode,
  base32CrockfordEncode,
  base64urlDecode,
  base64urlEncode,
  canonicalJson,
  concatBytes,
  hexDecode,
  hexEncode,
  readU16,
  readU32,
  signingBytes,
  u16,
  u32,
  utf8Decode,
  utf8Encode,
} from '../src/index.js';

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);
const ascii = (s: string): Uint8Array => utf8Encode(s);

describe('base64url', () => {
  it('vektor RFC 4648 (tanpa padding)', () => {
    const vectors: [string, string][] = [
      ['', ''],
      ['f', 'Zg'],
      ['fo', 'Zm8'],
      ['foo', 'Zm9v'],
      ['foob', 'Zm9vYg'],
      ['fooba', 'Zm9vYmE'],
      ['foobar', 'Zm9vYmFy'],
    ];
    for (const [plain, encoded] of vectors) {
      expect(base64urlEncode(ascii(plain))).toBe(encoded);
      expect(utf8Decode(base64urlDecode(encoded))).toBe(plain);
    }
  });

  it('memakai alfabet URL (- dan _)', () => {
    expect(base64urlEncode(bytes(0xfb, 0xff, 0xbf))).toBe('-_-_');
  });

  it('round-trip sama dengan Buffer untuk semua panjang 0–96', () => {
    for (let n = 0; n <= 96; n++) {
      const input = new Uint8Array(randomBytes(n));
      const encoded = base64urlEncode(input);
      expect(encoded).toBe(Buffer.from(input).toString('base64url'));
      expect(base64urlDecode(encoded)).toEqual(input);
    }
  });

  it('menolak bentuk non-kanonik dan karakter asing', () => {
    for (const bad of ['Zg==', 'Zh', 'Zm9=', 'Z', 'Zm9v Yg', 'Zm9+', 'Zm9/', 'Zm9vé', 'Zm9v\n']) {
      expect(() => base64urlDecode(bad), bad).toThrow(EncodingError);
    }
  });
});

describe('hex', () => {
  it('round-trip huruf kecil', () => {
    const input = new Uint8Array(randomBytes(32));
    expect(hexDecode(hexEncode(input))).toEqual(input);
    expect(hexEncode(bytes(0, 0x0f, 0xab, 0xff))).toBe('000fabff');
  });

  it('menolak huruf besar, panjang ganjil, karakter asing', () => {
    for (const bad of ['AB', 'abc', 'zz', '0x00'])
      expect(() => hexDecode(bad), bad).toThrow(EncodingError);
  });
});

describe('base32 Crockford', () => {
  it('20 byte menjadi tepat 32 karakter', () => {
    expect(base32CrockfordEncode(new Uint8Array(20))).toBe('0'.repeat(32));
    expect(base32CrockfordEncode(new Uint8Array(20).fill(0xff))).toBe('Z'.repeat(32));
  });

  it('vektor yang dihitung manual', () => {
    // 0x00 0x44 0x32 0x14 0xc7 = 00000 00001 00010 00011 00100 00101 00110 00111
    expect(base32CrockfordEncode(bytes(0x00, 0x44, 0x32, 0x14, 0xc7))).toBe('01234567');
    // 0x42 0x52 0xd8 0xe6 0xbf = 01000 01001 01001 01101 10001 11001 10101 11111 → 8 9 9 13 17 25 21 31
    expect(base32CrockfordEncode(bytes(0x42, 0x52, 0xd8, 0xe6, 0xbf))).toBe('899DHSNZ');
  });

  it('round-trip untuk panjang 0–40', () => {
    for (let n = 0; n <= 40; n++) {
      const input = new Uint8Array(randomBytes(n));
      expect(base32CrockfordDecode(base32CrockfordEncode(input))).toEqual(input);
    }
  });

  it('menolak huruf kecil, alias I/L/O/U, dan bit sisa', () => {
    for (const bad of ['abcd', 'I000', 'L000', 'O000', 'U000', '01', '0-1']) {
      expect(() => base32CrockfordDecode(bad), bad).toThrow(EncodingError);
    }
  });
});

describe('canonicalJson', () => {
  it('urutan kunci tidak memengaruhi hasil', () => {
    const a = { b: 1, a: { d: [3, 2, 1], c: 'x' } };
    const b = { a: { c: 'x', d: [3, 2, 1] }, b: 1 };
    expect(canonicalJson(a)).toBe('{"a":{"c":"x","d":[3,2,1]},"b":1}');
    expect(canonicalJson(b)).toBe(canonicalJson(a));
  });

  it('kunci diurutkan per code unit UTF-16', () => {
    expect(canonicalJson({ b: 1, B: 2, á: 3, a: 4, '😀': 5 })).toBe(
      '{"B":2,"a":4,"b":1,"á":3,"😀":5}',
    );
  });

  it('string di-escape sama seperti JSON.stringify', () => {
    const s = 'kutip " garis \\ baris\n tab\t kontrol \u0001 emoji 😀 <script>';
    expect(canonicalJson(s)).toBe(JSON.stringify(s));
    expect(JSON.parse(canonicalJson({ s }))).toEqual({ s });
  });

  it('menolak nilai yang tidak bisa direpresentasikan secara kanonik', () => {
    const bad: unknown[] = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -0,
      undefined,
      { a: undefined },
      () => 1,
      1n,
      new Date(0),
      new Map(),
      new Uint8Array(1),
      Symbol('x'),
    ];
    for (const value of bad)
      expect(() => canonicalJson(value), String(value)).toThrow(EncodingError);
  });

  it('menolak struktur terlalu dalam', () => {
    let deep: unknown = 1;
    for (let i = 0; i < 40; i++) deep = [deep];
    expect(() => canonicalJson(deep)).toThrow(EncodingError);
  });

  it('signingBytes = utf8(label) || utf8(canonical)', () => {
    expect(utf8Decode(signingBytes('bc-x-v1', { b: 2, a: 1 }))).toBe('bc-x-v1{"a":1,"b":2}');
  });
});

describe('bytes', () => {
  it('u32 / u16 big-endian dan batasnya', () => {
    expect(u32(0x01020304)).toEqual(bytes(1, 2, 3, 4));
    expect(readU32(bytes(9, 1, 2, 3, 4), 1)).toBe(0x01020304);
    expect(u16(0xabcd)).toEqual(bytes(0xab, 0xcd));
    expect(readU16(bytes(0xab, 0xcd), 0)).toBe(0xabcd);
    for (const bad of [-1, 2 ** 32, 1.5]) expect(() => u32(bad)).toThrow(EncodingError);
    expect(() => u16(0x10000)).toThrow(EncodingError);
    expect(() => readU32(bytes(1, 2, 3), 0)).toThrow(EncodingError);
  });

  it('concatBytes', () => {
    expect(concatBytes(bytes(1), bytes(), bytes(2, 3))).toEqual(bytes(1, 2, 3));
  });

  it('utf8Decode menolak byte tidak valid', () => {
    expect(() => utf8Decode(bytes(0xff))).toThrow(EncodingError);
    expect(() => utf8Decode(bytes(0xc3))).toThrow(EncodingError);
    expect(utf8Decode(utf8Encode('á😀'))).toBe('á😀');
  });
});
