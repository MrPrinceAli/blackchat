// Route khusus test (D-006). Hanya di-import saat __BC_TEST__ true, sehingga tidak ada di bundle produksi.
import { deleteExpiredAccounts } from './account.js';
import { advanceClock, now, resetClock } from './clock.js';
import type { Env } from './env.js';

export async function handleTestRoute(
  request: Request,
  env: Env,
  path: string,
): Promise<Response | null> {
  if (request.method !== 'POST') return null;
  if (path === '/__test/clock') {
    const body = (await request.json()) as { advanceMs?: number; reset?: boolean };
    if (body.reset) resetClock();
    if (typeof body.advanceMs === 'number') advanceClock(body.advanceMs);
    return Response.json({ now: now() });
  }
  if (path === '/__test/cron') {
    return Response.json({ deleted: await deleteExpiredAccounts(env) });
  }
  return null;
}
