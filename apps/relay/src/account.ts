// Endpoint akun (PRD §5.2). Akun dengan expires_at <= now() diperlakukan seolah tidak ada di semua handler (PRD §5.3).
import {
  ACCOUNT,
  base64urlDecode,
  base64urlEncode,
  contactsRequest,
  deleteAccountRequest,
  ERRORS,
  LABELS,
  loginRequest,
  passwordRequest,
  registerRequest,
  vUsername,
  type ContactsRequest,
  type DeleteAccountRequest,
  type LoginResponse,
  type LookupResponse,
  type PasswordRequest,
  type RegisterResponse,
  type SaltResponse,
} from '@blackchat/protocol';
import { now } from './clock.js';
import type { Env } from './env.js';
import { fakeSalt, sha256, userIdFromEdPk } from './hash.js';
import { clientIp, HttpError, readJson } from './http.js';
import { enforceRate, loginGuard } from './limiter.js';
import { timingSafeEqual, verifyFields, verifyXPk } from './verify.js';

/** Baris tabel accounts (PRD §5.1). */
export interface AccountRow {
  username: string;
  user_id: string;
  ed_pk: string;
  x_pk: string;
  x_pk_sig: string;
  salt: string;
  auth_hash: string;
  vault: string;
  contacts: string | null;
  seq: number;
  expires_at: number;
}

const roundDownToHour = (t: number): number => t - (t % ACCOUNT.EXPIRY_ROUNDING_MS);

export function liveAccountByUsername(env: Env, username: string): Promise<AccountRow | null> {
  return env.DB.prepare('SELECT * FROM accounts WHERE username = ? AND expires_at > ?')
    .bind(username, now())
    .first<AccountRow>();
}

export function liveAccountById(env: Env, userId: string): Promise<AccountRow | null> {
  return env.DB.prepare('SELECT * FROM accounts WHERE user_id = ? AND expires_at > ?')
    .bind(userId, now())
    .first<AccountRow>();
}

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Error && /UNIQUE constraint failed/i.test(error.message);

// ---------------------------------------------------------------- register

export async function register(request: Request, env: Env): Promise<RegisterResponse> {
  await enforceRate(env, 'register', clientIp(request));
  const body = await readJson(request, registerRequest);
  const { sig, ...fields } = body;
  const edPk = base64urlDecode(body.edPk);

  if (!(await verifyXPk(edPk, base64urlDecode(body.xPk), base64urlDecode(body.xPkSig)))) {
    throw new HttpError(ERRORS.UNAUTHORIZED);
  }
  if (!(await verifyFields(edPk, LABELS.REQ_REGISTER, fields, base64urlDecode(sig)))) {
    throw new HttpError(ERRORS.UNAUTHORIZED);
  }

  const userId = userIdFromEdPk(edPk);
  const authHash = base64urlEncode(await sha256(base64urlDecode(body.authKey)));
  const t = now();
  const expiresAt = t + ACCOUNT.LIFETIME_MS;

  try {
    // D-004: baris hangus yang belum disapu cron tidak boleh menghalangi register ulang.
    await env.DB.batch([
      env.DB.prepare(
        'DELETE FROM accounts WHERE (username = ? OR user_id = ?) AND expires_at <= ?',
      ).bind(body.username, userId, t),
      env.DB.prepare(
        `INSERT INTO accounts (username, user_id, ed_pk, x_pk, x_pk_sig, salt, auth_hash, vault, contacts, seq, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?)`,
      ).bind(
        body.username,
        userId,
        body.edPk,
        body.xPk,
        body.xPkSig,
        body.salt,
        authHash,
        body.vault,
        expiresAt,
      ),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(ERRORS.CONFLICT);
    throw error;
  }
  return { userId, expiresAt, remainingMs: expiresAt - t };
}

// ---------------------------------------------------------------- salt

export async function salt(request: Request, env: Env, url: URL): Promise<SaltResponse> {
  await enforceRate(env, 'lookup', clientIp(request));
  const checked = vUsername(url.searchParams.get('u'));
  if (!checked.ok) throw new HttpError(ERRORS.INVALID);
  const row = await liveAccountByUsername(env, checked.value);
  // Username tak dikenal/hangus mendapat salt palsu yang stabil, tak bisa dibedakan dari yang asli.
  return { salt: row ? row.salt : base64urlEncode(fakeSalt(env, checked.value)) };
}

// ---------------------------------------------------------------- login

const NO_MATCH = new Uint8Array(32);

export async function login(request: Request, env: Env): Promise<LoginResponse> {
  await enforceRate(env, 'login', clientIp(request));
  const body = await readJson(request, loginRequest);
  const guard = loginGuard(env, body.username);
  await guard.check();

  const row = await liveAccountByUsername(env, body.username);
  const computed = await sha256(base64urlDecode(body.authKey));
  // Bandingkan juga saat akun tidak ada supaya alurnya sama.
  const expected = row ? base64urlDecode(row.auth_hash) : NO_MATCH;
  const match = timingSafeEqual(computed, expected) && row !== null;
  if (!match || !row) {
    await guard.failed();
    throw new HttpError(ERRORS.UNAUTHORIZED);
  }
  await guard.succeeded();

  const t = now();
  return {
    userId: row.user_id,
    edPk: row.ed_pk,
    xPk: row.x_pk,
    xPkSig: row.x_pk_sig,
    vault: row.vault,
    contacts: row.contacts,
    expiresAt: row.expires_at,
    remainingMs: row.expires_at - t,
    seq: row.seq,
  };
}

// ---------------------------------------------------------------- lookup

export async function lookup(
  request: Request,
  env: Env,
  rawUsername: string,
): Promise<LookupResponse> {
  await enforceRate(env, 'lookup', clientIp(request));
  const checked = vUsername(rawUsername);
  if (!checked.ok) throw new HttpError(ERRORS.INVALID);
  const row = await liveAccountByUsername(env, checked.value);
  if (!row) throw new HttpError(ERRORS.NOT_FOUND);
  return {
    userId: row.user_id,
    edPk: row.ed_pk,
    xPk: row.x_pk,
    xPkSig: row.x_pk_sig,
    // Dibulatkan ke bawah agar waktu register tidak bisa diketahui persis (PRD §5.2).
    expiresAt: roundDownToHour(row.expires_at),
  };
}

// ---------------------------------------------------------------- update bertanda tangan

/**
 * Ambil akun hidup, verifikasi tanda tangan dengan ed_pk tersimpan, dan pastikan seq naik.
 * Akun tidak ada → not_found; tanda tangan salah → unauthorized; seq tidak naik → conflict.
 */
async function authorizeSigned<T extends { userId: string; seq: number; sig: string }>(
  env: Env,
  label: string,
  body: T,
): Promise<AccountRow> {
  const row = await liveAccountById(env, body.userId);
  if (!row) throw new HttpError(ERRORS.NOT_FOUND);
  const { sig, ...fields } = body;
  if (!(await verifyFields(base64urlDecode(row.ed_pk), label, fields, base64urlDecode(sig)))) {
    throw new HttpError(ERRORS.UNAUTHORIZED);
  }
  if (body.seq <= row.seq) throw new HttpError(ERRORS.CONFLICT);
  return row;
}

/** UPDATE dengan syarat seq lama dan akun masih hidup; gagal jika ada update lain di antaranya. */
async function applyUpdate(
  env: Env,
  row: AccountRow,
  setSql: string,
  values: unknown[],
  seq: number,
): Promise<void> {
  const result = await env.DB.prepare(
    `UPDATE accounts SET ${setSql}, seq = ? WHERE user_id = ? AND seq = ? AND expires_at > ?`,
  )
    .bind(...values, seq, row.user_id, row.seq, now())
    .run();
  if (result.meta.changes !== 1) throw new HttpError(ERRORS.CONFLICT);
}

export async function updateContacts(request: Request, env: Env): Promise<Record<string, never>> {
  const body: ContactsRequest = await readJson(request, contactsRequest);
  const row = await authorizeSigned(env, LABELS.REQ_CONTACTS, body);
  await applyUpdate(env, row, 'contacts = ?', [body.contacts], body.seq);
  return {};
}

export async function updatePassword(request: Request, env: Env): Promise<Record<string, never>> {
  const body: PasswordRequest = await readJson(request, passwordRequest);
  const row = await authorizeSigned(env, LABELS.REQ_PASSWORD, body);
  const authHash = base64urlEncode(await sha256(base64urlDecode(body.authKey)));
  await applyUpdate(
    env,
    row,
    'salt = ?, auth_hash = ?, vault = ?',
    [body.salt, authHash, body.vault],
    body.seq,
  );
  return {};
}

/**
 * Hapus akun sekarang (PRD §5.2). Client wajib menjalankan room.purge di setiap room sebelumnya (W11).
 * Server menghapus baris D1 lalu mengosongkan InboxDO.
 */
export async function deleteAccount(request: Request, env: Env): Promise<Record<string, never>> {
  const body: DeleteAccountRequest = await readJson(request, deleteAccountRequest);
  const row = await authorizeSigned(env, LABELS.REQ_DELETE, body);
  const result = await env.DB.prepare('DELETE FROM accounts WHERE user_id = ? AND seq = ?')
    .bind(row.user_id, row.seq)
    .run();
  if (result.meta.changes !== 1) throw new HttpError(ERRORS.CONFLICT);
  await env.INBOX.get(env.INBOX.idFromName(`inbox:${row.user_id}`)).destroy();
  return {};
}

// ---------------------------------------------------------------- cron

/** Hapus akun hangus (PRD §5.3). Mengembalikan jumlah baris yang dihapus. */
export async function deleteExpiredAccounts(env: Env): Promise<number> {
  const result = await env.DB.prepare('DELETE FROM accounts WHERE expires_at <= ?')
    .bind(now())
    .run();
  return result.meta.changes;
}
