// Data contoh untuk layar statis W6. Diganti data sungguhan di W7 (akun/sesi) dan W8 (room/pesan).
import type { BubbleStatus } from '../components/SecretBubble.svelte';

export interface SampleMessage {
  id: string;
  mine: boolean;
  text: string;
  status: BubbleStatus;
  remainingMs?: number;
}

export const sample = {
  username: 'kamu',
  remainingMs: (2 * 24 + 14) * 3_600_000 + 3 * 60_000,
  rooms: [
    { username: 'rara', unread: 2 },
    { username: 'dimas', unread: 0 },
  ],
  peer: 'rara',
  ttl: 5 as const,
  watermark: 'K4Q9ZX',
  messages: [
    { id: 'm1', mine: false, text: 'jam 8 di tempat biasa', status: 'opened', remainingMs: 5000 },
    { id: 'm2', mine: false, text: 'jangan bawa ponsel', status: 'queued' },
    { id: 'm3', mine: true, text: 'oke, aku datang', status: 'delivered' },
  ] satisfies SampleMessage[] as SampleMessage[],
  safetyNumber: [
    '30418',
    '77215',
    '09934',
    '51862',
    '24470',
    '68135',
    '90227',
    '13584',
    '46091',
    '82753',
    '35608',
    '71249',
  ],
};
