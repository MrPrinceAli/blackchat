import { describe, expect, it } from 'vitest';
import { installGuard, type GuardTargets } from './guard';

function fakeTargets() {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), {
    hidden: false,
    focused: true,
    hasFocus: (): boolean => true,
  });
  doc.hasFocus = () => doc.focused;
  return { targets: { window: win, document: doc } as unknown as GuardTargets, win, doc };
}

describe('guard tampilan (PRD §9)', () => {
  it('menyensor saat blur dan tab tersembunyi, membuka lagi saat fokus kembali', () => {
    const { targets, win, doc } = fakeTargets();
    const states: boolean[] = [];
    const remove = installGuard((c) => states.push(c), targets);
    expect(states).toEqual([false]);

    win.dispatchEvent(new Event('blur'));
    expect(states.at(-1)).toBe(true);
    win.dispatchEvent(new Event('focus'));
    expect(states.at(-1)).toBe(false);

    doc.hidden = true;
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(states.at(-1)).toBe(true);
    doc.hidden = false;
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(states.at(-1)).toBe(false);

    doc.focused = false;
    win.dispatchEvent(new Event('focus'));
    expect(states.at(-1)).toBe(true);
    remove();
  });

  it('memblok copy, cut, dan dragstart; dilepas setelah uninstall', () => {
    const { targets, doc } = fakeTargets();
    const remove = installGuard(() => undefined, targets);
    for (const type of ['copy', 'cut', 'dragstart']) {
      const event = new Event(type, { cancelable: true });
      doc.dispatchEvent(event);
      expect(event.defaultPrevented, type).toBe(true);
    }
    remove();
    const after = new Event('copy', { cancelable: true });
    doc.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it('mulai tersensor jika halaman dibuka tanpa fokus', () => {
    const { targets, doc } = fakeTargets();
    doc.focused = false;
    const states: boolean[] = [];
    installGuard((c) => states.push(c), targets)();
    expect(states).toEqual([true]);
  });
});
