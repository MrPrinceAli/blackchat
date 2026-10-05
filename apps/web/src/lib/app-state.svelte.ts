// State aplikasi yang dibaca UI. Tidak memuat kunci rahasia (itu hanya di account.ts).
import type { ConnectionStatus } from './ws';

export interface AppState {
  /** Sedang memulihkan sesi saat aplikasi dimuat. */
  booting: boolean;
  username: string;
  userId: string;
  /** Sisa umur akun menurut server; AccountClock menghitung mundur sendiri dari nilai ini. */
  remainingMs: number;
  connection: ConnectionStatus;
  /** Peringatan 60 dtk sebelum sesi dikunci (PRD §5.4 langkah 9). */
  idleWarning: boolean;
  /** Pesan setelah sesi berakhir (misal dikunci karena tidak aktif). */
  notice: string | null;
}

export const app = $state<AppState>({
  booting: true,
  username: '',
  userId: '',
  remainingMs: 0,
  connection: 'idle',
  idleWarning: false,
  notice: null,
});
