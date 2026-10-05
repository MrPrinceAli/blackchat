import { describe, expect, it } from 'vitest';
import {
  BINARY_FRAME,
  HEADER,
  IMAGE_CIPHER_CHUNK_BYTES,
  base64urlEncode,
  encodeChunkFrame,
  parseChunkFrame,
  type ChunkFrameHeader,
} from '../src/index.js';
import { auth, b64, ops, PEER_ID, PEER_INBOX } from './fixtures.js';

const header: ChunkFrameHeader = {
  reqId: 11,
  op: { ...ops.putChunk, kind: 'putChunk', idx: 2 },
  auth,
  peerUserId: PEER_ID,
  peerInboxRoomId: PEER_INBOX,
  sealedHeaderForPeer: b64(HEADER.SEALED_BYTES),
};
const data = new Uint8Array(IMAGE_CIPHER_CHUNK_BYTES).fill(9);

describe('frame biner chunk (PRD §13.2)', () => {
  it('encode → parse round-trip', () => {
    const r = parseChunkFrame(encodeChunkFrame(header, data));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.header).toEqual(header);
      expect(r.value.data).toEqual(data);
    }
  });

  it('prefiks berisi tipe, msgId, idx, dan panjang header', () => {
    const frame = encodeChunkFrame(header, data);
    expect(frame[0]).toBe(BINARY_FRAME.TYPE_CHUNK);
    expect(base64urlEncode(frame.subarray(1, 17))).toBe(header.op.msgId);
    expect(Array.from(frame.subarray(17, 21))).toEqual([0, 0, 0, 2]);
  });

  it('menolak tipe salah', () => {
    const frame = encodeChunkFrame(header, data);
    frame[0] = 0x02;
    expect(parseChunkFrame(frame).ok).toBe(false);
  });

  it('menolak msgId atau idx prefiks yang tidak sama dengan header', () => {
    const a = encodeChunkFrame(header, data);
    a[1] = a[1]! ^ 1;
    expect(parseChunkFrame(a).ok).toBe(false);
    const b = encodeChunkFrame(header, data);
    b[20] = 3;
    expect(parseChunkFrame(b).ok).toBe(false);
  });

  it('menolak data yang tidak tepat ukuran chunk', () => {
    const short = encodeChunkFrame(header, data.subarray(1));
    expect(parseChunkFrame(short).ok).toBe(false);
    const frame = encodeChunkFrame(header, data);
    expect(parseChunkFrame(frame.subarray(0, frame.length - 1)).ok).toBe(false);
  });

  it('menolak frame terpotong, header rusak, dan header terlalu panjang', () => {
    const frame = encodeChunkFrame(header, data);
    expect(parseChunkFrame(frame.subarray(0, 10)).ok).toBe(false);
    const broken = frame.slice();
    broken[BINARY_FRAME.PREFIX_BYTES] = 0x7b + 1; // '{' → '|'
    expect(parseChunkFrame(broken).ok).toBe(false);
    const huge = frame.slice();
    huge[21] = 0xff;
    huge[22] = 0xff;
    expect(parseChunkFrame(huge).ok).toBe(false);
  });

  it('menolak header dengan auth tidak valid', () => {
    const bad = { ...header, auth: { ...auth, proof: 'x' } };
    expect(parseChunkFrame(encodeChunkFrame(bad, data)).ok).toBe(false);
  });

  it('header dengan rute lawan dan header tersegel muat dalam batas frame', () => {
    const frame = encodeChunkFrame(header, data);
    expect(frame.length).toBeLessThanOrEqual(300 * 1024);
  });

  it('encode menolak frame melebihi 300 KB', () => {
    expect(() => encodeChunkFrame(header, new Uint8Array(300 * 1024))).toThrow();
  });
});
