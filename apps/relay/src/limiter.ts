import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env.js';

/** PRD §6.4. Diisi di W4. */
export class LimiterDO extends DurableObject<Env> {}
