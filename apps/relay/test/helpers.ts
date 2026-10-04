// Client uji di dalam workerd: identitas Ed25519 lewat WebCrypto (libsodium tidak dipakai di runtime Workers).
// Kompatibilitas dengan libsodium client dibuktikan terpisah lewat vektor di hash.test.ts.
import { SELF } from 'cloudflare:test';
import {
  base64urlEncode,
  concatBytes,
  LABELS,
  signingBytes,
  utf8Encode,
  VAULT_BYTES,
  type RegisterRequest,
} from '@blackchat/protocol';

export const ORIGIN = 'http://localhost:5173';
export const HOUR = 3_600_000;

let ipCounter = 0;
/** IP unik per pemanggil supaya rate limit antar-test tidak saling memengaruhi. */
export const nextIp = (): string => `198.51.100.${++ipCounter % 250}.${ipCounter}`;

let nameCounter = 0;
export const nextUsername = (prefix = 'u'): string =>
  `${prefix}_${Date.now().toString(36).slice(-5)}_${++nameCounter}`.slice(0, 20);

export interface CallOptions {
  body?: unknown;
  rawBody?: string;
  ip?: string;
  origin?: string | null;
  headers?: Record<string, string>;
}

export async function call(
  method: string,
  path: string,
  options: CallOptions = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    'CF-Connecting-IP': options.ip ?? nextIp(),
    ...options.headers,
  };
  if (options.origin !== null) headers['Origin'] = options.origin ?? ORIGIN;
  let body: string | undefined;
  if (options.rawBody !== undefined) body = options.rawBody;
  else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers['Content-Type'] ??= 'application/json';
  }
  return SELF.fetch(`https://relay.test${path}`, { method, headers, body: body ?? null });
}

export async function callJson<T = Record<string, unknown>>(
  method: string,
  path: string,
  options: CallOptions = {},
): Promise<{ status: number; body: T; response: Response }> {
  const response = await call(method, path, options);
  return { status: response.status, body: (await response.json()) as T, response };
}

export const advanceClock = (ms: number) =>
  call('POST', '/__test/clock', { body: { advanceMs: ms }, origin: null });
export const resetClock = () =>
  call('POST', '/__test/clock', { body: { reset: true }, origin: null });
export const runCron = async (): Promise<number> =>
  (
    (await (await call('POST', '/__test/cron', { body: {}, origin: null })).json()) as {
      deleted: number;
    }
  ).deleted;

const random = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));

export interface TestAccount {
  username: string;
  userId: string;
  edPk: Uint8Array;
  authKey: string;
  salt: string;
  register: RegisterRequest;
  sign(message: Uint8Array): Promise<Uint8Array>;
  /** Tanda tangan request bertanda tangan: label || canonical(fields). */
  signFields(label: string, fields: unknown): Promise<string>;
}

export async function newAccount(username = nextUsername()): Promise<TestAccount> {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const edPk = new Uint8Array(
    (await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer,
  );
  const sign = async (message: Uint8Array) =>
    new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, pair.privateKey, message));
  const signFields = async (label: string, fields: unknown) =>
    base64urlEncode(await sign(signingBytes(label, fields)));

  const xPk = random(32);
  const fields = {
    username,
    salt: base64urlEncode(random(16)),
    authKey: base64urlEncode(random(32)),
    edPk: base64urlEncode(edPk),
    xPk: base64urlEncode(xPk),
    xPkSig: base64urlEncode(await sign(concatBytes(utf8Encode(LABELS.XPK), xPk))),
    vault: base64urlEncode(random(VAULT_BYTES)),
  };
  const register: RegisterRequest = {
    ...fields,
    sig: await signFields(LABELS.REQ_REGISTER, fields),
  };
  return {
    username,
    userId: '',
    edPk,
    authKey: fields.authKey,
    salt: fields.salt,
    register,
    sign,
    signFields,
  };
}

/** Buat dan daftarkan akun; userId diisi dari respons server. */
export async function registered(username?: string): Promise<TestAccount> {
  const account = await newAccount(username);
  const { status, body } = await callJson<{ userId: string }>('POST', '/v1/account/register', {
    body: account.register,
  });
  if (status !== 200) throw new Error(`register gagal: ${status} ${JSON.stringify(body)}`);
  account.userId = body.userId;
  return account;
}

export const login = (account: Pick<TestAccount, 'username' | 'authKey'>, ip?: string) =>
  callJson('POST', '/v1/account/login', {
    body: { username: account.username, authKey: account.authKey },
    ...(ip ? { ip } : {}),
  });
