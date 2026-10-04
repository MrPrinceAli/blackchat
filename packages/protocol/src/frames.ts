// Frame biner upload chunk (PRD §13.2):
// [1 byte tipe=0x01][16 byte msgId][4 byte idx u32 BE][2 byte panjang header u16 BE][header JSON][data chunk]

import { BINARY_FRAME, IMAGE_CIPHER_CHUNK_BYTES, LIMITS, SIZES } from './constants.js';
import {
  base64urlDecode,
  base64urlEncode,
  concatBytes,
  EncodingError,
  readU16,
  readU32,
  u16,
  u32,
  utf8Decode,
  utf8Encode,
} from './encoding.js';
import type { ChunkFrame, ChunkFrameHeader } from './types.js';
import { chunkFrameHeader, type Result } from './validate.js';

export function encodeChunkFrame(
  header: ChunkFrameHeader,
  data: Uint8Array,
): Uint8Array<ArrayBuffer> {
  const msgId = base64urlDecode(header.op.msgId);
  if (msgId.length !== SIZES.MSG_ID) throw new EncodingError('msgId harus 16 byte');
  const json = utf8Encode(JSON.stringify(header));
  if (json.length > BINARY_FRAME.HEADER_MAX_BYTES) throw new EncodingError('header terlalu besar');
  const frame = concatBytes(
    Uint8Array.of(BINARY_FRAME.TYPE_CHUNK),
    msgId,
    u32(header.op.idx),
    u16(json.length),
    json,
    data,
  );
  if (frame.length > LIMITS.CHUNK_FRAME_MAX_BYTES) throw new EncodingError('frame terlalu besar');
  return frame;
}

/**
 * Menolak frame yang: terlalu besar, tipe salah, header tidak valid, msgId/idx di header
 * tidak sama dengan prefiks, atau data chunk tidak tepat IMAGE_CIPHER_CHUNK_BYTES (semua chunk identik, PRD §4.5).
 */
export function parseChunkFrame(bytes: Uint8Array): Result<ChunkFrame> {
  const fail = (error: string): Result<ChunkFrame> => ({ ok: false, error: `chunk: ${error}` });
  if (bytes.length > LIMITS.CHUNK_FRAME_MAX_BYTES) return fail('frame terlalu besar');
  if (bytes.length < BINARY_FRAME.PREFIX_BYTES) return fail('frame terpotong');
  if (bytes[0] !== BINARY_FRAME.TYPE_CHUNK) return fail('tipe frame tidak dikenal');

  const msgId = base64urlEncode(bytes.subarray(1, 1 + SIZES.MSG_ID));
  const idx = readU32(bytes, 1 + SIZES.MSG_ID);
  const headerLength = readU16(bytes, 1 + SIZES.MSG_ID + 4);
  if (headerLength > BINARY_FRAME.HEADER_MAX_BYTES) return fail('header terlalu besar');
  const dataStart = BINARY_FRAME.PREFIX_BYTES + headerLength;
  if (dataStart > bytes.length) return fail('header terpotong');

  let parsed: unknown;
  try {
    parsed = JSON.parse(utf8Decode(bytes.subarray(BINARY_FRAME.PREFIX_BYTES, dataStart)));
  } catch {
    return fail('header bukan JSON UTF-8 yang valid');
  }
  const header = chunkFrameHeader(parsed, 'chunk.header');
  if (!header.ok) return header;
  if (header.value.op.msgId !== msgId) return fail('msgId header tidak sama dengan prefiks');
  if (header.value.op.idx !== idx) return fail('idx header tidak sama dengan prefiks');

  const data = bytes.slice(dataStart);
  if (data.length !== IMAGE_CIPHER_CHUNK_BYTES) {
    return fail(`data chunk harus tepat ${IMAGE_CIPHER_CHUNK_BYTES} byte`);
  }
  return { ok: true, value: { header: header.value, data } };
}
