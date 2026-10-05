import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env.js';

/** PRD §6.1. Socket, daftar room, dan alarm hangus diisi di W5. */
export class InboxDO extends DurableObject<Env> {
  /** Hapus akun sekarang (PRD §5.2): tutup semua socket dan kosongkan storage. */
  async destroy(): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) socket.close(1000, 'account deleted');
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }
}
