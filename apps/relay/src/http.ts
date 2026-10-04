import { ERRORS, LIMITS, parseJson, type ErrorCode, type Validator } from '@blackchat/protocol';
import type { Env } from './env.js';

const STATUS: Record<ErrorCode, number> = {
  invalid: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  room_full: 409,
  quota_exceeded: 409,
  bad_proof: 401,
  replay: 409,
  expired: 410,
  internal: 500,
};

/** Error yang aman dikirim ke client: hanya kode, tanpa detail internal. */
export class HttpError extends Error {
  override readonly name = 'HttpError';
  constructor(
    readonly code: ErrorCode,
    readonly retryAfterMs?: number,
  ) {
    super(code);
  }
}

const BASE_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
} as const;

/** CORS hanya untuk ALLOWED_ORIGIN (PRD §5.2). */
function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin');
  return origin !== null && origin === env.ALLOWED_ORIGIN
    ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
    : { Vary: 'Origin' };
}

export function json(request: Request, env: Env, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, ...corsHeaders(request, env) },
  });
}

export function errorResponse(request: Request, env: Env, error: HttpError): Response {
  const response = json(request, env, { error: error.code }, STATUS[error.code]);
  if (error.retryAfterMs !== undefined) {
    response.headers.set('Retry-After', String(Math.max(1, Math.ceil(error.retryAfterMs / 1000))));
  }
  return response;
}

/** Origin asing ditolak sebelum request diproses. Request tanpa Origin (bukan browser) diizinkan. */
export function checkOrigin(request: Request, env: Env): void {
  const origin = request.headers.get('Origin');
  if (origin !== null && origin !== env.ALLOWED_ORIGIN) throw new HttpError(ERRORS.FORBIDDEN);
}

export function preflight(request: Request, env: Env): Response {
  checkOrigin(request, env);
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request, env),
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600',
    },
  });
}

/**
 * Body JSON dengan batas ukuran. Content-Type wajib application/json, sehingga request lintas origin
 * selalu butuh preflight CORS.
 */
export async function readJson<T>(request: Request, validate: Validator<T>): Promise<T> {
  const type = request.headers.get('Content-Type') ?? '';
  if (!/^application\/json\s*(;|$)/i.test(type)) throw new HttpError(ERRORS.INVALID);
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (declared > LIMITS.HTTP_BODY_MAX_BYTES) throw new HttpError(ERRORS.INVALID);
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > LIMITS.HTTP_BODY_MAX_BYTES) throw new HttpError(ERRORS.INVALID);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(buffer);
  } catch {
    throw new HttpError(ERRORS.INVALID);
  }
  const result = parseJson(text, validate, LIMITS.HTTP_BODY_MAX_BYTES);
  if (!result.ok) throw new HttpError(ERRORS.INVALID);
  return result.value;
}

/** IP klien hanya dipakai di memori untuk kunci limiter (di-hash, tidak pernah disimpan). */
export function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown';
}
