import {
  CONTACTS,
  contactList,
  LABELS,
  utf8Decode,
  utf8Encode,
  type Contact,
} from '@blackchat/protocol';
import { aeadDecrypt, aeadEncrypt } from './aead.js';
import { wipe } from './bytes.js';
import { pad, unpad } from './pad.js';
import { CryptoError } from './sodium.js';

/**
 * contacts = AEAD(vaultKey, sodium_pad(JSON(list), 4096), aad="bc-contacts-v1") (PRD §4.8).
 * Padding membuat ukuran blob tidak mencerminkan jumlah kontak.
 */
export function sealContacts(vaultKey: Uint8Array, list: Contact[]): Uint8Array {
  const checked = contactList(list);
  if (!checked.ok) throw new CryptoError(`daftar kontak tidak valid: ${checked.error}`);
  const json = utf8Encode(JSON.stringify(checked.value));
  const padded = pad(json, CONTACTS.PAD_BLOCK);
  try {
    if (padded.length > CONTACTS.MAX_PAD_BLOCKS * CONTACTS.PAD_BLOCK) {
      throw new CryptoError('daftar kontak terlalu besar');
    }
    return aeadEncrypt(vaultKey, padded, LABELS.CONTACTS_BLOB);
  } finally {
    wipe(json, padded);
  }
}

/** Buka blob kontak dan validasi isinya. Melempar CryptoError jika kunci salah atau isi tidak valid. */
export function openContacts(vaultKey: Uint8Array, blob: Uint8Array): Contact[] {
  const padded = aeadDecrypt(vaultKey, blob, LABELS.CONTACTS_BLOB);
  let json: Uint8Array | undefined;
  try {
    json = unpad(padded, CONTACTS.PAD_BLOCK);
    let parsed: unknown;
    try {
      parsed = JSON.parse(utf8Decode(json));
    } catch {
      throw new CryptoError('isi blob kontak bukan JSON');
    }
    const checked = contactList(parsed);
    if (!checked.ok) throw new CryptoError(`isi blob kontak tidak valid: ${checked.error}`);
    return checked.value;
  } finally {
    wipe(padded, json);
  }
}
