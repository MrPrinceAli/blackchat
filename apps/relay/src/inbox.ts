import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env.js';

/** PRD §6.1. Diisi di W5. */
export class InboxDO extends DurableObject<Env> {}
