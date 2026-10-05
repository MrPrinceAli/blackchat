// Encoding tanpa dependensi luar. Semua decoder ketat: hanya menerima bentuk kanonik,
// sehingga satu nilai biner punya tepat satu representasi string (penting untuk nama DO dan tanda tangan).

export class EncodingError extends Error {
  override readonly name = 'EncodingError';
}

// ---------------------------------------------------------------- UTF-8

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

export function utf8Encode(text: string): Uint8Array<ArrayBuffer> {
  // TextEncoder selalu menghasilkan buffer ArrayBuffer biasa; sebagian definisi tipe (workers-types) menulisnya generik.
  return textEncoder.encode(text) as Uint8Array<ArrayBuffer>;
}

/** Menolak UTF-8 tidak valid. */
export function utf8Decode(bytes: Uint8Array): string {
  try {
    return textDecoder.decode(bytes);
  } catch {
    throw new EncodingError('UTF-8 tidak valid');
  }
}

// ---------------------------------------------------------------- bytes

export function concatBytes(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  let length = 0;
  for (const part of parts) length += part.length;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** u32 big-endian. */
export function u32(value: number): Uint8Array<ArrayBuffer> {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new EncodingError('u32 di luar rentang');
  }
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, false);
  return out;
}

export function readU32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) throw new EncodingError('u32 terpotong');
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

export function readU16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) throw new EncodingError('u16 terpotong');
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, false);
}

export function u16(value: number): Uint8Array<ArrayBuffer> {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new EncodingError('u16 di luar rentang');
  }
  const out = new Uint8Array(2);
  new DataView(out.buffer).setUint16(0, value, false);
  return out;
}

// ---------------------------------------------------------------- base64url (tanpa padding)

const B64U = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64U_LOOKUP = buildLookup(B64U);

export function base64urlEncode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += B64U[(n >> 18) & 63]! + B64U[(n >> 12) & 63]! + B64U[(n >> 6) & 63]! + B64U[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += B64U[(n >> 18) & 63]! + B64U[(n >> 12) & 63]!;
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += B64U[(n >> 18) & 63]! + B64U[(n >> 12) & 63]! + B64U[(n >> 6) & 63]!;
  }
  return out;
}

/** Panjang byte hasil decode untuk string base64url tanpa padding, atau -1 jika panjangnya mustahil. */
export function base64urlDecodedLength(length: number): number {
  const rest = length % 4;
  if (rest === 1) return -1;
  return Math.floor(length / 4) * 3 + (rest === 0 ? 0 : rest - 1);
}

/** Menolak padding, alfabet base64 standar, spasi, dan bit sisa yang tidak nol (bentuk non-kanonik). */
export function base64urlDecode(text: string): Uint8Array<ArrayBuffer> {
  const length = base64urlDecodedLength(text.length);
  if (length < 0) throw new EncodingError('panjang base64url tidak valid');
  const out = new Uint8Array(length);
  let buffer = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < text.length; i++) {
    const v = B64U_LOOKUP[text.charCodeAt(i)];
    if (v === undefined || v < 0) throw new EncodingError('karakter base64url tidak valid');
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buffer >> bits) & 0xff;
    }
    buffer &= (1 << bits) - 1;
  }
  if (buffer !== 0) throw new EncodingError('base64url non-kanonik');
  return out;
}

// ---------------------------------------------------------------- hex (huruf kecil)

const HEX = '0123456789abcdef';

export function hexEncode(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += HEX[b >> 4]! + HEX[b & 15]!;
  return out;
}

/** Hanya menerima hex huruf kecil dengan panjang genap. */
export function hexDecode(text: string): Uint8Array<ArrayBuffer> {
  if (text.length % 2 !== 0) throw new EncodingError('panjang hex ganjil');
  const out = new Uint8Array(text.length / 2);
  for (let i = 0; i < out.length; i++) {
    const hi = HEX.indexOf(text[i * 2]!);
    const lo = HEX.indexOf(text[i * 2 + 1]!);
    if (hi < 0 || lo < 0) throw new EncodingError('karakter hex tidak valid');
    out[i] = (hi << 4) | lo;
  }
  return out;
}

// ---------------------------------------------------------------- base32 Crockford (huruf besar, tanpa padding)

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const B32_LOOKUP = buildLookup(B32);

export function base32CrockfordEncode(bytes: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const b of bytes) {
    buffer = (buffer << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += B32[(buffer >> bits) & 31]!;
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += B32[(buffer << (5 - bits)) & 31]!;
  return out;
}

/** Hanya bentuk kanonik huruf besar (tanpa alias I/L/O/U, tanpa tanda hubung). */
export function base32CrockfordDecode(text: string): Uint8Array<ArrayBuffer> {
  const length = Math.floor((text.length * 5) / 8);
  const out = new Uint8Array(length);
  let buffer = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < text.length; i++) {
    const v = B32_LOOKUP[text.charCodeAt(i)];
    if (v === undefined || v < 0) throw new EncodingError('karakter base32 tidak valid');
    buffer = (buffer << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buffer >> bits) & 0xff;
    }
    buffer &= (1 << bits) - 1;
  }
  if (buffer !== 0 || bits >= 5) throw new EncodingError('base32 non-kanonik');
  return out;
}

// ---------------------------------------------------------------- canonical JSON

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/**
 * JSON kanonik: kunci objek diurutkan (urutan code unit UTF-16, seperti RFC 8785), tanpa spasi.
 * Menolak NaN, Infinity, -0, undefined, fungsi, dan objek non-plain, alih-alih diam-diam membuangnya.
 */
export function canonicalJson(value: unknown): string {
  return serialize(value, 0);
}

const MAX_DEPTH = 32;

function serialize(value: unknown, depth: number): string {
  if (depth > MAX_DEPTH) throw new EncodingError('JSON terlalu dalam');
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new EncodingError('angka tidak hingga');
      if (Object.is(value, -0)) throw new EncodingError('-0 tidak diizinkan');
      return JSON.stringify(value);
    case 'string':
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map((item: unknown) => serialize(item, depth + 1)).join(',')}]`;
      }
      const proto: unknown = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) {
        throw new EncodingError('hanya objek plain yang diizinkan');
      }
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      const parts: string[] = [];
      for (const key of keys) {
        const item = record[key];
        if (item === undefined) throw new EncodingError(`nilai undefined pada "${key}"`);
        parts.push(`${JSON.stringify(key)}:${serialize(item, depth + 1)}`);
      }
      return `{${parts.join(',')}}`;
    }
    default:
      throw new EncodingError(`tipe ${typeof value} tidak diizinkan`);
  }
}

/** Byte yang ditandatangani untuk request bertanda tangan: utf8(label) || utf8(canonical(fields)). */
export function signingBytes(label: string, fields: unknown): Uint8Array<ArrayBuffer> {
  return utf8Encode(label + canonicalJson(fields));
}

// ---------------------------------------------------------------- util

function buildLookup(alphabet: string): Int8Array {
  const table = new Int8Array(128).fill(-1);
  for (let i = 0; i < alphabet.length; i++) table[alphabet.charCodeAt(i)] = i;
  return table;
}
