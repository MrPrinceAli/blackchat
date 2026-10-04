import type { Env } from './env.js';

export { InboxDO } from './inbox.js';
export { LimiterDO } from './limiter.js';
export { RoomDO } from './room.js';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export default {
  async fetch(): Promise<Response> {
    return new Response(null, { status: 404, headers: NO_STORE });
  },
  async scheduled(): Promise<void> {
    // Pembersihan akun hangus di D1 — W4 (PRD §5.3).
  },
} satisfies ExportedHandler<Env>;
