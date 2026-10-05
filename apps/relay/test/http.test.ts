import { env } from 'cloudflare:test';
import { LIMITS } from '@blackchat/protocol';
import { describe, expect, it } from 'vitest';
import { saltSecret } from '../src/hash.js';
import { call, newAccount, ORIGIN } from './helpers.js';

describe('header & CORS (PRD §5.2)', () => {
  it('semua respons no-store; CORS hanya untuk ALLOWED_ORIGIN', async () => {
    const ok = await call('GET', '/v1/account/salt?u=rara');
    expect(ok.headers.get('Cache-Control')).toBe('no-store');
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(ok.headers.get('X-Content-Type-Options')).toBe('nosniff');

    const notFound = await call('GET', '/v1/tidak-ada');
    expect(notFound.status).toBe(404);
    expect(notFound.headers.get('Cache-Control')).toBe('no-store');
  });

  it('origin asing ditolak 403 tanpa header CORS', async () => {
    const response = await call('GET', '/v1/account/salt?u=rara', {
      origin: 'https://jahat.example',
    });
    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(await response.json()).toEqual({ error: 'forbidden' });
  });

  it('request tanpa Origin (bukan browser) diizinkan tanpa header CORS', async () => {
    const response = await call('GET', '/v1/account/salt?u=rara', { origin: null });
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('preflight hanya untuk origin yang diizinkan', async () => {
    const ok = await call('OPTIONS', '/v1/account/login');
    expect(ok.status).toBe(204);
    expect(ok.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(
      (await call('OPTIONS', '/v1/account/login', { origin: 'https://jahat.example' })).status,
    ).toBe(403);
  });
});

describe('body request', () => {
  it('wajib application/json', async () => {
    const account = await newAccount();
    const response = await call('POST', '/v1/account/register', {
      rawBody: JSON.stringify(account.register),
      headers: { 'Content-Type': 'text/plain' },
    });
    expect(response.status).toBe(400);
  });

  it('menolak body melebihi batas, JSON rusak, dan UTF-8 tidak valid', async () => {
    const big = JSON.stringify({ username: 'x'.repeat(LIMITS.HTTP_BODY_MAX_BYTES) });
    for (const rawBody of [big, '{', '']) {
      const response = await call('POST', '/v1/account/login', {
        rawBody,
        headers: { 'Content-Type': 'application/json' },
      });
      expect(response.status).toBe(400);
    }
  });

  it('metode yang tidak cocok → 404', async () => {
    expect((await call('GET', '/v1/account/register')).status).toBe(404);
    expect((await call('PATCH', '/v1/account/contacts', { body: {} })).status).toBe(404);
  });
});

describe('SALT_SECRET (fail closed)', () => {
  it('menolak rahasia yang bukan 32 byte hex', () => {
    expect(() => saltSecret({ ...env, SALT_SECRET: '' })).toThrow();
    expect(() => saltSecret({ ...env, SALT_SECRET: 'ab'.repeat(16) })).toThrow();
    expect(() => saltSecret({ ...env, SALT_SECRET: 'ZZ'.repeat(32) })).toThrow();
    expect(saltSecret(env)).toHaveLength(32);
  });
});

describe('route test (D-006)', () => {
  it('reset-limits mengosongkan rate limit', async () => {
    const { nextIp: ipFor } = await import('./helpers.js');
    const ip = ipFor();
    for (let i = 0; i < 30; i++) await call('GET', '/v1/account/lookup/ghost_reset', { ip });
    expect((await call('GET', '/v1/account/lookup/ghost_reset', { ip })).status).toBe(429);
    expect((await call('POST', '/__test/reset-limits', { body: {}, origin: null })).status).toBe(
      200,
    );
    expect((await call('GET', '/v1/account/lookup/ghost_reset', { ip })).status).toBe(404);
  });
});
