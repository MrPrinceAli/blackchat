// Perlindungan tampilan (PRD §9): sensor saat jendela tidak fokus / tab tersembunyi, blok salin/potong/seret.
// Print diblok di CSS (base.css). Menu konteks bawaan dimatikan per area lewat action `noContextMenu`.

export interface GuardTargets {
  window: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  document: Pick<Document, 'addEventListener' | 'removeEventListener' | 'hasFocus'> & {
    readonly hidden: boolean;
  };
}

/** Apakah tampilan harus disensor sekarang. */
export function shouldConceal(targets: GuardTargets): boolean {
  return targets.document.hidden || !targets.document.hasFocus();
}

/**
 * Pasang guard. `onConceal(true)` saat jendela kehilangan fokus atau tab tersembunyi, `false` saat kembali.
 * Mengembalikan fungsi untuk melepas semua listener.
 */
export function installGuard(
  onConceal: (concealed: boolean) => void,
  targets?: GuardTargets,
): () => void {
  const t: GuardTargets = targets ?? { window, document };
  const block = (event: Event) => event.preventDefault();
  // Bentuk objek, bukan `true`: EventTarget Node tidak melepas listener capture yang didaftarkan dengan boolean.
  const capture = { capture: true } as const;
  const update = () => onConceal(shouldConceal(t));
  const conceal = () => onConceal(true);

  t.window.addEventListener('blur', conceal);
  t.window.addEventListener('focus', update);
  t.document.addEventListener('visibilitychange', update);
  for (const type of ['copy', 'cut', 'dragstart'] as const)
    t.document.addEventListener(type, block, capture);
  update();

  return () => {
    t.window.removeEventListener('blur', conceal);
    t.window.removeEventListener('focus', update);
    t.document.removeEventListener('visibilitychange', update);
    for (const type of ['copy', 'cut', 'dragstart'] as const)
      t.document.removeEventListener(type, block, capture);
  };
}

/** Svelte action: matikan menu konteks bawaan browser di area ini (PRD §7.4). */
export function noContextMenu(node: HTMLElement): { destroy(): void } {
  const block = (event: Event) => event.preventDefault();
  node.addEventListener('contextmenu', block);
  return { destroy: () => node.removeEventListener('contextmenu', block) };
}
