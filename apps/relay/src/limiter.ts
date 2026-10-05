// Rate limit di memori (PRD §6.4, D-003, D-012). Tidak ada storage: jika instance di-evict,
// penghitung hilang (diterima). Kunci yang masuk ke sini sudah di-hash; IP/username mentah tidak pernah tiba di DO.
import { DurableObject } from 'cloudflare:workers';
import { ERRORS, hexEncode, LABELS, RATE_LIMITS, utf8Encode } from '@blackchat/protocol';
import { now } from './clock.js';
import type { Env } from './env.js';
import { blake2b, saltSecret } from './hash.js';
import { HttpError } from './http.js';

export interface RateResult {
  ok: boolean;
  retryAfterMs: number;
}

interface FailureState {
  count: number;
  lockedUntil: number;
  lastAt: number;
}

/** Riwayat gagal login dilupakan setelah selama ini tanpa percobaan baru. */
const FAILURE_MEMORY_MS = 60 * 60 * 1000;
/** Sapu entri kedaluwarsa setiap kali peta melebihi ukuran ini. */
const SWEEP_THRESHOLD = 10_000;

export class LimiterDO extends DurableObject<Env> {
  private readonly hits = new Map<string, number[]>();
  private readonly failures = new Map<string, FailureState>();

  /** Sliding window: maksimal `limit` hit per `windowMs`. */
  async hit(key: string, limit: number, windowMs: number): Promise<RateResult> {
    const t = now();
    if (this.hits.size > SWEEP_THRESHOLD) this.sweep(t, windowMs);
    const recent = (this.hits.get(key) ?? []).filter((at) => at > t - windowMs);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return { ok: false, retryAfterMs: recent[0]! + windowMs - t };
    }
    recent.push(t);
    this.hits.set(key, recent);
    return { ok: true, retryAfterMs: 0 };
  }

  /** Sisa jeda login untuk username ini (0 = boleh mencoba). */
  async loginGate(key: string): Promise<number> {
    const state = this.failures.get(key);
    return state ? Math.max(0, state.lockedUntil - now()) : 0;
  }

  /** Catat gagal login. Gagal ke-n ≥ 5 → jeda 30 dtk × 2^(n−5), maks 15 menit (D-003). */
  async loginFailed(key: string): Promise<number> {
    const t = now();
    if (this.failures.size > SWEEP_THRESHOLD) this.sweep(t, 0);
    const previous = this.failures.get(key);
    const count = previous && t - previous.lastAt < FAILURE_MEMORY_MS ? previous.count + 1 : 1;
    const { FREE_FAILURES, BASE_MS, MAX_MS } = RATE_LIMITS.LOGIN_FAILURES;
    const delay =
      count >= FREE_FAILURES ? Math.min(BASE_MS * 2 ** (count - FREE_FAILURES), MAX_MS) : 0;
    this.failures.set(key, { count, lockedUntil: t + delay, lastAt: t });
    return delay;
  }

  async loginSucceeded(key: string): Promise<void> {
    this.failures.delete(key);
  }

  /** Hanya untuk test (D-006): kosongkan semua penghitung. */
  async reset(): Promise<void> {
    if (!__BC_TEST__) return;
    this.hits.clear();
    this.failures.clear();
  }

  private sweep(t: number, windowMs: number): void {
    for (const [key, times] of this.hits) {
      if (times.every((at) => at <= t - Math.max(windowMs, RATE_LIMITS.REGISTER_PER_IP.windowMs))) {
        this.hits.delete(key);
      }
    }
    for (const [key, state] of this.failures) {
      if (t - state.lastAt >= FAILURE_MEMORY_MS && state.lockedUntil <= t)
        this.failures.delete(key);
    }
  }
}

// ---------------------------------------------------------------- sisi Worker

export type RateAction = 'register' | 'login' | 'lookup' | 'send' | 'chunk';

const RULES: Record<RateAction, { limit: number; windowMs: number }> = {
  register: RATE_LIMITS.REGISTER_PER_IP,
  login: RATE_LIMITS.LOGIN_PER_IP,
  lookup: RATE_LIMITS.LOOKUP_PER_IP,
  send: RATE_LIMITS.SEND_PER_ACCOUNT,
  chunk: RATE_LIMITS.CHUNK_PER_ACCOUNT,
};

/**
 * Kunci limiter = hex(BLAKE2b-256(key=SALT_SECRET, label || nilai)) (D-012). Stabil antar-isolate
 * tanpa menyimpan IP/username. Shard = karakter hex pertama (16 instance, PRD §6.4).
 */
function limiterKey(env: Env, label: string, value: string): string {
  return hexEncode(blake2b(32, utf8Encode(label + value), saltSecret(env)));
}

function shard(env: Env, key: string) {
  return env.LIMITER.get(env.LIMITER.idFromName(`limiter:${key[0]}`));
}

/** Lempar HttpError rate_limited jika batas `action` untuk subjek ini terlampaui. */
export async function enforceRate(env: Env, action: RateAction, subject: string): Promise<void> {
  const label = action === 'send' || action === 'chunk' ? LABELS.LIMIT_USER : LABELS.LIMIT_IP;
  const key = limiterKey(env, label, subject);
  const rule = RULES[action];
  const result = await shard(env, key).hit(`${action}:${key}`, rule.limit, rule.windowMs);
  if (!result.ok) throw new HttpError(ERRORS.RATE_LIMITED, result.retryAfterMs);
}

export interface LoginGuard {
  /** Lempar rate_limited jika username sedang dijeda. */
  check(): Promise<void>;
  failed(): Promise<void>;
  succeeded(): Promise<void>;
}

export function loginGuard(env: Env, username: string): LoginGuard {
  const key = limiterKey(env, LABELS.LIMIT_USER, username);
  const stub = shard(env, key);
  const id = `login:${key}`;
  return {
    async check() {
      const wait = await stub.loginGate(id);
      if (wait > 0) throw new HttpError(ERRORS.RATE_LIMITED, wait);
    },
    async failed() {
      await stub.loginFailed(id);
    },
    async succeeded() {
      await stub.loginSucceeded(id);
    },
  };
}
