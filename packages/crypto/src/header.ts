import {
  base64urlDecode,
  HEADER,
  roomHeader,
  utf8Decode,
  utf8Encode,
  type RoomHeader,
} from '@blackchat/protocol';
import { wipe } from './bytes.js';
import { userIdFromEdPk, verifyXPk } from './keys.js';
import { pad, unpad } from './pad.js';
import { sealOpen, sealTo } from './seal.js';
import { CryptoError } from './sodium.js';

/**
 * Header room tersegel ke xPk pemilik inbox (PRD §6.1). Plaintext di-pad tepat satu blok 512 byte
 * sehingga ciphertext selalu HEADER.SEALED_BYTES dan tidak membocorkan panjang username (D-009).
 */
export function sealHeader(ownerXPk: Uint8Array, header: RoomHeader): Uint8Array {
  const checked = roomHeader(header);
  if (!checked.ok) throw new CryptoError(`header tidak valid: ${checked.error}`);
  const json = utf8Encode(JSON.stringify(checked.value));
  const padded = pad(json, HEADER.PAD_BLOCK);
  try {
    if (padded.length !== HEADER.PAD_BLOCK) throw new CryptoError('header melebihi satu blok');
    return sealTo(ownerXPk, padded);
  } finally {
    wipe(json, padded);
  }
}

/**
 * Buka header dan pastikan konsisten: userId sesuai edPk, dan xPk ditandatangani edPk.
 * Melempar CryptoError jika bukan untuk kunci ini, rusak, atau tidak konsisten.
 */
export function openHeader(
  ownerXPk: Uint8Array,
  ownerXSk: Uint8Array,
  sealed: Uint8Array,
): RoomHeader {
  if (sealed.length !== HEADER.SEALED_BYTES) throw new CryptoError('ukuran header tidak valid');
  const padded = sealOpen(ownerXPk, ownerXSk, sealed);
  let json: Uint8Array | undefined;
  try {
    json = unpad(padded, HEADER.PAD_BLOCK);
    let parsed: unknown;
    try {
      parsed = JSON.parse(utf8Decode(json));
    } catch {
      throw new CryptoError('header bukan JSON');
    }
    const checked = roomHeader(parsed);
    if (!checked.ok) throw new CryptoError(`header tidak valid: ${checked.error}`);
    const h = checked.value;
    const edPk = base64urlDecode(h.peerEdPk);
    if (userIdFromEdPk(edPk) !== h.peerUserId) throw new CryptoError('userId lawan tidak cocok');
    if (!verifyXPk(edPk, base64urlDecode(h.peerXPk), base64urlDecode(h.peerXPkSig))) {
      throw new CryptoError('tanda tangan xPk lawan tidak valid');
    }
    return h;
  } finally {
    wipe(padded, json);
  }
}
