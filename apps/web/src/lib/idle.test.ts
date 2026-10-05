import { SESSION } from '@blackchat/protocol';
import { describe, expect, it } from 'vitest';
import { ActivityTracker, idleState, type IdleState } from './idle';

const MIN = 60_000;

function setup() {
  let now = 1_000_000;
  const persisted: number[] = [];
  const states: IdleState[] = [];
  const tracker = new ActivityTracker({
    now: () => now,
    persist: (t) => persisted.push(t),
    onState: (s) => states.push(s),
  });
  return { tracker, persisted, states, advance: (ms: number) => (now += ms), now: () => now };
}

describe('kunci otomatis 10 menit (PRD §5.4)', () => {
  it('idleState: aktif < 9 menit, peringatan 9–10 menit, terkunci ≥ 10 menit', () => {
    expect(idleState(9 * MIN - 1, 0)).toBe('active');
    expect(idleState(9 * MIN, 0)).toBe('warning');
    expect(idleState(10 * MIN - 1, 0)).toBe('warning');
    expect(idleState(10 * MIN, 0)).toBe('locked');
  });

  it('peringatan muncul tepat 60 dtk sebelum terkunci', () => {
    expect(SESSION.IDLE_LOCK_MS - SESSION.WARNING_BEFORE_LOCK_MS).toBe(9 * MIN);
  });

  it('terkunci walau timer diperlambat (tab tersembunyi): cukup satu pengecekan setelah 10 menit', () => {
    const { tracker, states, advance } = setup();
    advance(25 * MIN); // tidak ada pengecekan selama tab tersembunyi
    expect(tracker.check()).toBe('locked');
    expect(states).toEqual(['locked']);
  });

  it('aktivitas menunda kunci dan menghapus peringatan', () => {
    const { tracker, states, advance } = setup();
    advance(9 * MIN);
    tracker.check();
    expect(states).toEqual(['warning']);
    tracker.touch();
    expect(states).toEqual(['warning', 'active']);
    advance(9 * MIN + 59_000);
    expect(tracker.check()).toBe('warning');
    advance(1000);
    expect(tracker.check()).toBe('locked');
  });

  it('setelah terkunci, aktivitas tidak membuka kembali', () => {
    const { tracker, advance } = setup();
    advance(10 * MIN);
    tracker.check();
    tracker.touch();
    expect(tracker.current).toBe('locked');
  });

  it('lastActive disimpan maksimal 1× per 15 dtk', () => {
    const { tracker, persisted, advance } = setup();
    tracker.touch();
    advance(5000);
    tracker.touch();
    advance(9000);
    tracker.touch();
    advance(1000);
    tracker.touch();
    expect(persisted).toHaveLength(2);
    expect(persisted[1]! - persisted[0]!).toBe(15_000);
  });
});
