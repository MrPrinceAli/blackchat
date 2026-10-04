import type { InboxDO } from './inbox.js';
import type { LimiterDO } from './limiter.js';
import type { RoomDO } from './room.js';

export interface Env {
  DB: D1Database;
  INBOX: DurableObjectNamespace<InboxDO>;
  ROOM: DurableObjectNamespace<RoomDO>;
  LIMITER: DurableObjectNamespace<LimiterDO>;
  ALLOWED_ORIGIN: string;
  /** 32 byte acak dalam hex (wrangler secret). Kunci salt palsu dan kunci limiter (PRD §5.2, D-012). */
  SALT_SECRET: string;
}
