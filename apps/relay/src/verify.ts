// Verifikasi tanda tangan Ed25519 dengan WebCrypto (Workers) dan perbandingan constant-time.
import { concatBytes, LABELS, signingBytes, SIZES, utf8Encode } from '@blackchat/protocol';

export async function verifyEd25519(
  edPk: Uint8Array,
  message: Uint8Array,
  sig: Uint8Array,
): Promise<boolean> {
  if (edPk.length !== SIZES.ED_PK || sig.length !== SIZES.ED_SIG) return false;
  try {
    const key = await crypto.subtle.importKey('raw', edPk, { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, sig, message);
  } catch {
    return false;
  }
}

/** Ed25519(edPk, "bc-xpk-v1" || xPk) (PRD §4.2). */
export function verifyXPk(edPk: Uint8Array, xPk: Uint8Array, xPkSig: Uint8Array): Promise<boolean> {
  if (xPk.length !== SIZES.X_PK) return Promise.resolve(false);
  return verifyEd25519(edPk, concatBytes(utf8Encode(LABELS.XPK), xPk), xPkSig);
}

/** Request bertanda tangan: Ed25519(edSk, label || canonical(fields tanpa sig)) (PRD §5.2). */
export function verifyFields(
  edPk: Uint8Array,
  label: string,
  fields: unknown,
  sig: Uint8Array,
): Promise<boolean> {
  return verifyEd25519(edPk, signingBytes(label, fields), sig);
}

/** Perbandingan constant-time (PRD §12 aturan 11). Panjang berbeda → false. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}
