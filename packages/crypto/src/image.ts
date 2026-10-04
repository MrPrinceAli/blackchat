import {
  base64urlDecode,
  base64urlEncode,
  concatBytes,
  hexDecode,
  IMAGE,
  IMAGE_CIPHER_CHUNK_BYTES,
  LABELS,
  SIZES,
  u32,
  utf8Encode,
  type InnerImage,
} from '@blackchat/protocol';
import { aeadDecrypt, aeadEncrypt } from './aead.js';
import { equalBytes, wipe } from './bytes.js';
import { blake2b } from './hash.js';
import { pad, unpad } from './pad.js';
import { CryptoError } from './sodium.js';

/** AAD chunk: "bc-img-v1" || roomId(32) || msgId(16) || u32(index) (PRD §4.5 langkah 3). */
export function imageChunkAad(roomId: string, msgId: string, index: number): Uint8Array {
  return concatBytes(utf8Encode(LABELS.IMG), hexDecode(roomId), base64urlDecode(msgId), u32(index));
}

/** BLAKE2b-256 byte gambar asli, base64url (field `hash` di Inner). */
export function imageHash(bytes: Uint8Array): string {
  return base64urlEncode(blake2b(SIZES.IMAGE_HASH, bytes));
}

export interface EncryptedImage {
  /** Setiap chunk tepat IMAGE_CIPHER_CHUNK_BYTES. */
  chunks: Uint8Array[];
  /** Nilai untuk Inner.image (bytes, chunks, hash). */
  bytes: number;
  hash: string;
}

/**
 * Pad gambar ke kelipatan tepat 256 KB, pecah per 256 KB, enkripsi tiap chunk dengan contentKey yang sama
 * dan AAD per index. Semua chunk identik ukurannya, jadi ukuran asli hanya ada di Inner terenkripsi.
 */
export function encryptImage(
  bytes: Uint8Array,
  contentKey: Uint8Array,
  roomId: string,
  msgId: string,
): EncryptedImage {
  if (bytes.length === 0) throw new CryptoError('gambar kosong');
  if (bytes.length > IMAGE.OUTPUT_MAX_BYTES) throw new CryptoError('gambar melebihi batas');
  const padded = pad(bytes, IMAGE.CHUNK_BYTES);
  try {
    const count = padded.length / IMAGE.CHUNK_BYTES;
    const chunks = Array.from({ length: count }, (_, i) =>
      aeadEncrypt(
        contentKey,
        padded.subarray(i * IMAGE.CHUNK_BYTES, (i + 1) * IMAGE.CHUNK_BYTES),
        imageChunkAad(roomId, msgId, i),
      ),
    );
    return { chunks, bytes: bytes.length, hash: imageHash(bytes) };
  } finally {
    wipe(padded);
  }
}

/**
 * Kebalikan encryptImage. Memeriksa jumlah & ukuran chunk, AAD per index, panjang asli, dan hash
 * (PRD §4.7: hash tidak cocok → tolak). Pemanggil wajib wipe hasilnya setelah digambar.
 */
export function decryptImage(
  chunks: Uint8Array[],
  contentKey: Uint8Array,
  roomId: string,
  msgId: string,
  image: Pick<InnerImage, 'chunks' | 'bytes' | 'hash'>,
): Uint8Array {
  if (chunks.length !== image.chunks) throw new CryptoError('jumlah chunk tidak sesuai');
  const parts: Uint8Array[] = [];
  let padded: Uint8Array | undefined;
  try {
    chunks.forEach((chunk, i) => {
      if (chunk.length !== IMAGE_CIPHER_CHUNK_BYTES)
        throw new CryptoError('ukuran chunk tidak valid');
      parts.push(aeadDecrypt(contentKey, chunk, imageChunkAad(roomId, msgId, i)));
    });
    padded = concatBytes(...parts);
    const bytes = unpad(padded, IMAGE.CHUNK_BYTES).slice();
    if (bytes.length !== image.bytes) {
      wipe(bytes);
      throw new CryptoError('ukuran gambar tidak sesuai');
    }
    if (!equalBytes(blake2b(SIZES.IMAGE_HASH, bytes), base64urlDecode(image.hash))) {
      wipe(bytes);
      throw new CryptoError('hash gambar tidak cocok');
    }
    return bytes;
  } finally {
    wipe(padded, ...parts);
  }
}
