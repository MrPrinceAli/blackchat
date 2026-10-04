import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env.js';

/** PRD §6.2. Diisi di W5. */
export class RoomDO extends DurableObject<Env> {}
