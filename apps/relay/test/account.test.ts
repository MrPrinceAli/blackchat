import { env } from 'cloudflare:test';
import {
  ACCOUNT,
  AEAD_OVERHEAD,
  base64urlDecode,
  base64urlEncode,
  CONTACTS,
  LABELS,
  VAULT_BYTES,
  type LoginResponse,
  type LookupResponse,
} from '@blackchat/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import {
  advanceClock,
  call,
  callJson,
  HOUR,
  login,
  newAccount,
  nextIp,
  nextUsername,
  registered,
  resetClock,
  runCron,
  type TestAccount,
} from './helpers.js';

afterEach(async () => {
  await resetClock();
});

const random = (n: number) => base64urlEncode(crypto.getRandomValues(new Uint8Array(n)));

async function signed<T extends Record<string, unknown>>(
  account: TestAccount,
  label: string,
  fields: T,
): Promise<T & { sig: string }> {
  return { ...fields, sig: await account.signFields(label, fields) };
}

describe('register & login (PRD §5.2)', () => {
  it('register lalu login mengembalikan data akun, umur ~72 jam', async () => {
    const account = await newAccount();
    const reg = await callJson<{ userId: string; expiresAt: number; remainingMs: number }>(
      'POST',
      '/v1/account/register',
      {
        body: account.register,
      },
    );
    expect(reg.status).toBe(200);
    expect(reg.body.userId).toMatch(/^[0-9A-HJKMNP-TV-Z]{32}$/);
    expect(reg.body.remainingMs).toBe(ACCOUNT.LIFETIME_MS);

    const { status, body } = await login(account);
    expect(status).toBe(200);
    const data = body as unknown as LoginResponse;
    expect(data.userId).toBe(reg.body.userId);
    expect(data.vault).toBe(account.register.vault);
    expect(data.edPk).toBe(account.register.edPk);
    expect(data.contacts).toBeNull();
    expect(data.seq).toBe(0);
    expect(data.remainingMs).toBeLessThanOrEqual(ACCOUNT.LIFETIME_MS);
  });

  it('username yang masih hidup tidak bisa didaftarkan dua kali', async () => {
    const first = await registered();
    const second = await newAccount(first.username);
    const { status, body } = await callJson('POST', '/v1/account/register', {
      body: second.register,
    });
    expect(status).toBe(409);
    expect(body).toEqual({ error: 'conflict' });
  });

  it('menolak register dengan tanda tangan salah atau xPkSig yang tidak cocok', async () => {
    const account = await newAccount();
    const badSig = { ...account.register, sig: random(64) };
    expect((await call('POST', '/v1/account/register', { body: badSig })).status).toBe(401);
    const other = await newAccount(account.username);
    const swapped = { ...account.register, xPk: other.register.xPk };
    expect((await call('POST', '/v1/account/register', { body: swapped })).status).toBe(401);
  });

  it('menolak xPkSig palsu walaupun seluruh request ditandatangani dengan benar', async () => {
    // Pemilik edSk yang sah tetapi xPk-nya tidak ditandatangani: lawan tidak bisa memastikan xPk milik edPk ini.
    const account = await newAccount();
    const { sig: _sig, ...fields } = account.register;
    const forged = { ...fields, xPkSig: random(64) };
    const body = { ...forged, sig: await account.signFields(LABELS.REQ_REGISTER, forged) };
    expect((await call('POST', '/v1/account/register', { body })).status).toBe(401);
  });

  it('menolak body tidak valid', async () => {
    const account = await newAccount();
    for (const body of [
      {},
      { ...account.register, username: 'Rara' },
      { ...account.register, extra: 1 },
      { ...account.register, vault: random(VAULT_BYTES - 1) },
    ]) {
      const { status, body: error } = await callJson('POST', '/v1/account/register', { body });
      expect(status).toBe(400);
      expect(error).toEqual({ error: 'invalid' });
    }
  });

  it('login dengan password salah atau username tak dikenal → pesan umum yang sama', async () => {
    const account = await registered();
    const wrong = await login({ username: account.username, authKey: random(32) });
    const unknown = await login({ username: nextUsername('nobody'), authKey: random(32) });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body).toEqual({ error: 'unauthorized' });
  });

  it('tabel accounts tidak punya kolom IP, user agent, atau waktu login (PRD §5.1)', async () => {
    const { results } = await env.DB.prepare('PRAGMA table_info(accounts)').all<{ name: string }>();
    expect(results.map((c) => c.name).sort()).toEqual(
      [
        'auth_hash',
        'contacts',
        'ed_pk',
        'expires_at',
        'salt',
        'seq',
        'user_id',
        'username',
        'vault',
        'x_pk',
        'x_pk_sig',
      ].sort(),
    );
  });

  it('server hanya menyimpan SHA-256(authKey), bukan authKey', async () => {
    const account = await registered();
    const row = await env.DB.prepare('SELECT auth_hash FROM accounts WHERE username = ?')
      .bind(account.username)
      .first<{ auth_hash: string }>();
    expect(row?.auth_hash).not.toBe(account.authKey);
    const expected = new Uint8Array(
      await crypto.subtle.digest('SHA-256', base64urlDecode(account.authKey)),
    );
    expect(row?.auth_hash).toBe(base64urlEncode(expected));
  });
});

describe('salt (PRD §5.2)', () => {
  it('username ada → salt asli; tidak ada → salt palsu stabil dengan format sama', async () => {
    const account = await registered();
    const real = await callJson<{ salt: string }>('GET', `/v1/account/salt?u=${account.username}`);
    expect(real.body.salt).toBe(account.salt);

    const name = nextUsername('ghost');
    const fake1 = await callJson<{ salt: string }>('GET', `/v1/account/salt?u=${name}`);
    const fake2 = await callJson<{ salt: string }>('GET', `/v1/account/salt?u=${name}`);
    const other = await callJson<{ salt: string }>(
      'GET',
      `/v1/account/salt?u=${nextUsername('ghost')}`,
    );
    expect(fake1.status).toBe(200);
    expect(fake1.body.salt).toBe(fake2.body.salt);
    expect(fake1.body.salt).not.toBe(other.body.salt);
    expect(fake1.body.salt).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(real.body.salt).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('akun hangus mendapat salt palsu', async () => {
    const account = await registered();
    await advanceClock(ACCOUNT.LIFETIME_MS);
    const { body } = await callJson<{ salt: string }>(
      'GET',
      `/v1/account/salt?u=${account.username}`,
    );
    expect(body.salt).not.toBe(account.salt);
  });

  it('menolak username tidak valid', async () => {
    expect((await call('GET', '/v1/account/salt?u=Rara')).status).toBe(400);
    expect((await call('GET', '/v1/account/salt')).status).toBe(400);
  });
});

describe('lookup (PRD §5.2)', () => {
  it('expiresAt dibulatkan ke bawah ke jam penuh, tanpa data rahasia', async () => {
    const account = await registered();
    const { status, body } = await callJson<LookupResponse>(
      'GET',
      `/v1/account/lookup/${account.username}`,
    );
    expect(status).toBe(200);
    expect(body.expiresAt % HOUR).toBe(0);
    expect(Object.keys(body).sort()).toEqual(['edPk', 'expiresAt', 'userId', 'xPk', 'xPkSig']);
    const row = await env.DB.prepare('SELECT expires_at FROM accounts WHERE username = ?')
      .bind(account.username)
      .first<{ expires_at: number }>();
    expect(body.expiresAt).toBeLessThanOrEqual(row!.expires_at);
    expect(row!.expires_at - body.expiresAt).toBeLessThan(HOUR);
  });

  it('username tak dikenal → 404; username tidak valid → 400', async () => {
    expect((await call('GET', `/v1/account/lookup/${nextUsername('ghost')}`)).status).toBe(404);
    expect((await call('GET', '/v1/account/lookup/Rara')).status).toBe(400);
    expect((await call('GET', '/v1/account/lookup/a%2Fb')).status).toBe(400);
  });
});

describe('umur akun 72 jam (PRD §5.3)', () => {
  it('akun hangus ditolak di login, lookup, dan update bertanda tangan', async () => {
    const account = await registered();
    await advanceClock(ACCOUNT.LIFETIME_MS);
    expect((await login(account)).status).toBe(401);
    expect((await call('GET', `/v1/account/lookup/${account.username}`)).status).toBe(404);
    const body = await signed(account, LABELS.REQ_CONTACTS, {
      userId: account.userId,
      contacts: random(AEAD_OVERHEAD + CONTACTS.PAD_BLOCK),
      seq: 1,
    });
    expect((await call('PUT', '/v1/account/contacts', { body })).status).toBe(404);
  });

  it('satu milidetik sebelum hangus masih bisa login', async () => {
    const account = await registered();
    await advanceClock(ACCOUNT.LIFETIME_MS - 1000);
    expect((await login(account)).status).toBe(200);
  });

  it('cron menghapus akun hangus dan membiarkan yang masih hidup', async () => {
    const old = await registered();
    await advanceClock(ACCOUNT.LIFETIME_MS - HOUR);
    const young = await registered();
    await advanceClock(HOUR);
    expect(await runCron()).toBeGreaterThanOrEqual(1);
    const names = (
      await env.DB.prepare('SELECT username FROM accounts').all<{ username: string }>()
    ).results.map((r) => r.username);
    expect(names).not.toContain(old.username);
    expect(names).toContain(young.username);
  });

  it('username hangus bisa didaftarkan ulang sebelum cron berjalan (D-004)', async () => {
    const old = await registered();
    await advanceClock(ACCOUNT.LIFETIME_MS);
    const reborn = await newAccount(old.username);
    const { status, body } = await callJson<{ userId: string }>('POST', '/v1/account/register', {
      body: reborn.register,
    });
    expect(status).toBe(200);
    expect(body.userId).not.toBe(old.userId);
    expect((await login(reborn)).status).toBe(200);
    expect((await login(old)).status).toBe(401);
  });
});

describe('update bertanda tangan (PRD §5.2)', () => {
  const contactsBlob = () => random(AEAD_OVERHEAD + CONTACTS.PAD_BLOCK);

  it('kontak: seq harus naik; seq lama dan replay ditolak', async () => {
    const account = await registered();
    const first = await signed(account, LABELS.REQ_CONTACTS, {
      userId: account.userId,
      contacts: contactsBlob(),
      seq: 1,
    });
    expect((await call('PUT', '/v1/account/contacts', { body: first })).status).toBe(200);
    expect((await call('PUT', '/v1/account/contacts', { body: first })).status).toBe(409);
    const stale = await signed(account, LABELS.REQ_CONTACTS, {
      userId: account.userId,
      contacts: contactsBlob(),
      seq: 1,
    });
    expect((await call('PUT', '/v1/account/contacts', { body: stale })).status).toBe(409);
    const jump = await signed(account, LABELS.REQ_CONTACTS, {
      userId: account.userId,
      contacts: contactsBlob(),
      seq: 5,
    });
    expect((await call('PUT', '/v1/account/contacts', { body: jump })).status).toBe(200);
    const data = (await login(account)).body as unknown as LoginResponse;
    expect(data.seq).toBe(5);
    expect(data.contacts).toBe(jump.contacts);
  });

  it('blob kontak harus kelipatan 4 KB agar ukurannya tidak membocorkan jumlah kontak (PRD §4.8)', async () => {
    const account = await registered();
    for (const [size, status] of [
      [AEAD_OVERHEAD + CONTACTS.PAD_BLOCK, 200],
      [AEAD_OVERHEAD + CONTACTS.PAD_BLOCK + 1, 400],
      [AEAD_OVERHEAD + 100, 400],
    ] as const) {
      const body = await signed(account, LABELS.REQ_CONTACTS, {
        userId: account.userId,
        contacts: random(size),
        seq: size,
      });
      expect((await call('PUT', '/v1/account/contacts', { body })).status, String(size)).toBe(
        status,
      );
    }
  });

  it('menolak tanda tangan akun lain, label lain, atau field yang diubah', async () => {
    const account = await registered();
    const other = await registered();
    const fields = { userId: account.userId, contacts: contactsBlob(), seq: 1 };
    const byOther = { ...fields, sig: await other.signFields(LABELS.REQ_CONTACTS, fields) };
    const wrongLabel = { ...fields, sig: await account.signFields(LABELS.REQ_PASSWORD, fields) };
    const tampered = { ...(await signed(account, LABELS.REQ_CONTACTS, fields)), seq: 2 };
    for (const body of [byOther, wrongLabel, tampered]) {
      expect((await call('PUT', '/v1/account/contacts', { body })).status).toBe(401);
    }
  });

  it('ganti password: authKey lama ditolak, yang baru diterima, salt & vault baru', async () => {
    const account = await registered();
    const fields = {
      userId: account.userId,
      salt: random(16),
      authKey: random(32),
      vault: random(VAULT_BYTES),
      seq: 1,
    };
    expect(
      (
        await call('PUT', '/v1/account/password', {
          body: await signed(account, LABELS.REQ_PASSWORD, fields),
        })
      ).status,
    ).toBe(200);
    expect((await login(account)).status).toBe(401);
    const fresh = await login({ username: account.username, authKey: fields.authKey });
    expect(fresh.status).toBe(200);
    expect((fresh.body as unknown as LoginResponse).vault).toBe(fields.vault);
    const salt = await callJson<{ salt: string }>('GET', `/v1/account/salt?u=${account.username}`);
    expect(salt.body.salt).toBe(fields.salt);
  });

  it('hapus akun: baris D1 hilang, InboxDO dikosongkan, username langsung bebas', async () => {
    const account = await registered();
    const inbox = env.INBOX.get(env.INBOX.idFromName(`inbox:${account.userId}`));
    // Isi storage InboxDO lewat runInDurableObject untuk membuktikan destroy() mengosongkannya.
    const { runInDurableObject } = await import('cloudflare:test');
    await runInDurableObject(inbox, async (_instance, state) => {
      await state.storage.put('penanda', 1);
    });
    const body = await signed(account, LABELS.REQ_DELETE, { userId: account.userId, seq: 1 });
    expect((await call('DELETE', '/v1/account', { body })).status).toBe(200);
    expect((await login(account)).status).toBe(401);
    expect((await call('GET', `/v1/account/lookup/${account.username}`)).status).toBe(404);
    await runInDurableObject(inbox, async (_instance, state) => {
      expect((await state.storage.list()).size).toBe(0);
    });
    expect((await call('DELETE', '/v1/account', { body })).status).toBe(404);
    const again = await newAccount(account.username);
    expect((await call('POST', '/v1/account/register', { body: again.register })).status).toBe(200);
  });

  it('akun yang tidak ada → 404', async () => {
    const account = await newAccount();
    const body = await signed(account, LABELS.REQ_DELETE, { userId: '0'.repeat(32), seq: 1 });
    expect((await call('DELETE', '/v1/account', { body })).status).toBe(404);
  });
});

describe('rate limit (PRD §6.4)', () => {
  it('register maksimal 3 per jam per IP', async () => {
    const ip = nextIp();
    for (let i = 0; i < 3; i++) {
      const account = await newAccount();
      expect(
        (await call('POST', '/v1/account/register', { body: account.register, ip })).status,
      ).toBe(200);
    }
    const fourth = await call('POST', '/v1/account/register', {
      body: (await newAccount()).register,
      ip,
    });
    expect(fourth.status).toBe(429);
    expect(Number(fourth.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(
      (await call('POST', '/v1/account/register', { body: (await newAccount()).register })).status,
    ).toBe(200);
    await advanceClock(HOUR);
    expect(
      (await call('POST', '/v1/account/register', { body: (await newAccount()).register, ip }))
        .status,
    ).toBe(200);
  });

  it('login maksimal 10 per 10 menit per IP', async () => {
    const ip = nextIp();
    const account = await registered();
    for (let i = 0; i < 10; i++) expect((await login(account, ip)).status).toBe(200);
    expect((await login(account, ip)).status).toBe(429);
  });

  it('lookup maksimal 30 per menit per IP', async () => {
    const ip = nextIp();
    const name = nextUsername('ghost');
    for (let i = 0; i < 30; i++)
      expect((await call('GET', `/v1/account/lookup/${name}`, { ip })).status).toBe(404);
    expect((await call('GET', `/v1/account/lookup/${name}`, { ip })).status).toBe(429);
    await advanceClock(60_000);
    expect((await call('GET', `/v1/account/lookup/${name}`, { ip })).status).toBe(404);
  });

  it('5 gagal login per username → jeda 30 dtk, berlipat ganda, dari IP mana pun (D-003)', async () => {
    const account = await registered();
    const wrong = { username: account.username, authKey: random(32) };
    for (let i = 0; i < 5; i++) expect((await login(wrong)).status).toBe(401);
    // Terkunci: password benar pun ditolak, dari IP lain.
    const locked = await login(account);
    expect(locked.status).toBe(429);
    expect(locked.response.headers.get('Retry-After')).toBe('30');

    await advanceClock(30_000);
    expect((await login(wrong)).status).toBe(401); // gagal ke-6 → 60 dtk
    await advanceClock(30_000);
    expect((await login(account)).status).toBe(429);
    await advanceClock(30_000);
    expect((await login(account)).status).toBe(200);
    // Sukses mereset penghitung.
    expect((await login(wrong)).status).toBe(401);
    expect((await login(account)).status).toBe(200);
  });

  it('jeda maksimal 15 menit', async () => {
    const account = await registered();
    const wrong = { username: account.username, authKey: random(32) };
    for (let i = 0; i < 5; i++) await login(wrong);
    for (let i = 0; i < 6; i++) {
      await advanceClock(15 * 60_000);
      await login(wrong);
    }
    const locked = await login(account);
    expect(locked.status).toBe(429);
    expect(Number(locked.response.headers.get('Retry-After'))).toBe(15 * 60);
  });
});
