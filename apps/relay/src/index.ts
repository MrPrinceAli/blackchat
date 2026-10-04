import { ERRORS } from '@blackchat/protocol';
import {
  deleteAccount,
  deleteExpiredAccounts,
  login,
  lookup,
  register,
  salt,
  updateContacts,
  updatePassword,
} from './account.js';
import type { Env } from './env.js';
import { checkOrigin, errorResponse, HttpError, json, preflight } from './http.js';

export { InboxDO } from './inbox.js';
export { LimiterDO } from './limiter.js';
export { RoomDO } from './room.js';

const LOOKUP_PREFIX = '/v1/account/lookup/';

async function route(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;
  const method = request.method;

  if (__BC_TEST__ && path.startsWith('/__test/')) {
    const { handleTestRoute } = await import('./test-routes.js');
    const response = await handleTestRoute(request, env, path);
    if (response) return response;
  }

  if (method === 'OPTIONS') return preflight(request, env);
  checkOrigin(request, env);

  if (method === 'POST' && path === '/v1/account/register')
    return json(request, env, await register(request, env));
  if (method === 'GET' && path === '/v1/account/salt')
    return json(request, env, await salt(request, env, url));
  if (method === 'POST' && path === '/v1/account/login')
    return json(request, env, await login(request, env));
  if (method === 'GET' && path.startsWith(LOOKUP_PREFIX)) {
    return json(request, env, await lookup(request, env, path.slice(LOOKUP_PREFIX.length)));
  }
  if (method === 'PUT' && path === '/v1/account/contacts')
    return json(request, env, await updateContacts(request, env));
  if (method === 'PUT' && path === '/v1/account/password')
    return json(request, env, await updatePassword(request, env));
  if (method === 'DELETE' && path === '/v1/account')
    return json(request, env, await deleteAccount(request, env));

  throw new HttpError(ERRORS.NOT_FOUND);
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      return await route(request, env, new URL(request.url));
    } catch (error) {
      if (error instanceof HttpError) return errorResponse(request, env, error);
      // Termasuk ConfigError (SALT_SECRET tidak valid): relay gagal tertutup.
      // Tanpa console (PRD §12 aturan 1): detail error tidak dicatat maupun dikirim ke client.
      return errorResponse(request, env, new HttpError(ERRORS.INTERNAL));
    }
  },

  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(deleteExpiredAccounts(env));
  },
} satisfies ExportedHandler<Env>;
