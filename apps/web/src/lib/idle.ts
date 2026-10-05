// Kunci otomatis karena tidak aktif (PRD §5.4). Dicek dengan selisih waktu, bukan hanya setTimeout,
// karena timer di tab tersembunyi diperlambat browser. Logika murni supaya bisa diuji dengan jam palsu.
import { SESSION } from '@blackchat/protocol';

export type IdleState = 'active' | 'warning' | 'locked';

export function idleState(now: number, lastActive: number): IdleState {
  const idle = now - lastActive;
  if (idle >= SESSION.IDLE_LOCK_MS) return 'locked';
  if (idle >= SESSION.IDLE_LOCK_MS - SESSION.WARNING_BEFORE_LOCK_MS) return 'warning';
  return 'active';
}

export interface ActivityTrackerOptions {
  now: () => number;
  /** Simpan lastActive ke penyimpanan tahan-refresh (dibatasi maks 1× per 15 dtk). */
  persist: (lastActive: number) => void;
  onState: (state: IdleState) => void;
}

export class ActivityTracker {
  private lastActive: number;
  private lastPersisted = Number.NEGATIVE_INFINITY;
  private state: IdleState = 'active';

  constructor(
    private readonly options: ActivityTrackerOptions,
    lastActive = options.now(),
  ) {
    this.lastActive = lastActive;
  }

  /** Aktivitas pengguna (pointerdown, keydown, wheel, touchstart, scroll). */
  touch(): void {
    if (this.state === 'locked') return;
    const t = this.options.now();
    this.lastActive = t;
    if (t - this.lastPersisted >= SESSION.ACTIVITY_THROTTLE_MS) {
      this.lastPersisted = t;
      this.options.persist(t);
    }
    this.check();
  }

  /** Dipanggil berkala (15 dtk) dan saat visibilitychange/focus. */
  check(): IdleState {
    const next = idleState(this.options.now(), this.lastActive);
    if (next !== this.state) {
      this.state = next;
      this.options.onState(next);
    }
    return next;
  }

  get current(): IdleState {
    return this.state;
  }
}
