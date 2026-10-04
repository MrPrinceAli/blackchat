import type { InboxDO } from './inbox.js';
import type { LimiterDO } from './limiter.js';
import type { RoomDO } from './room.js';

export interface Env {
  DB: D1Database;
  INBOX: DurableObjectNamespace<InboxDO>;
  ROOM: DurableObjectNamespace<RoomDO>;
  LIMITER: DurableObjectNamespace<LimiterDO>;
  ALLOWED_ORIGIN: string;
  SALT_SECRET: string;
}
