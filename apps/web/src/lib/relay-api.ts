// Klien HTTP relay (PRD §5.2). Semua respons divalidasi dengan packages/protocol sebelum dipakai (PRD §12 aturan 10).
import {
  emptyResponse,
  errorResponse,
  loginResponse,
  lookupResponse,
  parseJson,
  registerResponse,
  saltResponse,
  SERVER_FRAME_MAX_BYTES,
  type ContactsRequest,
  type DeleteAccountRequest,
  type ErrorCode,
  type LoginRequest,
  type PasswordRequest,
  type RegisterRequest,
  type Validator,
} from '@blackchat/protocol';

export const RELAY_URL = (import.meta.env.VITE_RELAY_URL || 'http://localhost:8787').replace(
  /\/+$/,
  '',
);

/** URL WebSocket ke InboxDO (PRD §6.1). */
export const relayWsUrl = (userId: string): string =>
  `${RELAY_URL.replace(/^http/, 'ws')}/v1/ws/${userId}`;

export class RelayError extends Error {
  override readonly name = 'RelayError';
  constructor(
    readonly code: ErrorCode | 'network',
    readonly status: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
}

async function call<T>(
  method: string,
  path: string,
  validate: Validator<T>,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${RELAY_URL}${path}`, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    throw new RelayError('network', 0);
  }
  const text = await response.text();
  if (!response.ok) {
    const parsed = parseJson(text, errorResponse, SERVER_FRAME_MAX_BYTES);
    const retryAfter = Number(response.headers.get('Retry-After'));
    throw new RelayError(
      parsed.ok ? parsed.value.error : 'internal',
      response.status,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    );
  }
  const parsed = parseJson(text, validate, SERVER_FRAME_MAX_BYTES);
  if (!parsed.ok) throw new RelayError('invalid', response.status);
  return parsed.value;
}

export const relayApi = {
  register: (body: RegisterRequest) => call('POST', '/v1/account/register', registerResponse, body),
  salt: (username: string) =>
    call('GET', `/v1/account/salt?u=${encodeURIComponent(username)}`, saltResponse),
  login: (body: LoginRequest) => call('POST', '/v1/account/login', loginResponse, body),
  lookup: (username: string) =>
    call('GET', `/v1/account/lookup/${encodeURIComponent(username)}`, lookupResponse),
  contacts: (body: ContactsRequest) => call('PUT', '/v1/account/contacts', emptyResponse, body),
  password: (body: PasswordRequest) => call('PUT', '/v1/account/password', emptyResponse, body),
  deleteAccount: (body: DeleteAccountRequest) => call('DELETE', '/v1/account', emptyResponse, body),
};
