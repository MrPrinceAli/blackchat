// "Dilihat" (PRD §7.2): ruang obrolan terbuka, tab fokus & terlihat, dan minimal 50% bubble di viewport.
// Bubble yang lebih tinggi dari layar dianggap dilihat jika menutupi minimal separuh tinggi layar,
// agar pesan panjang tetap bisa memicu timer (prinsip yang sama dengan batas tinggi gambar 60%).
import { MESSAGE } from '@blackchat/protocol';

export interface SeenParams {
  enabled: boolean;
  onSeen: () => void;
}

export interface IntersectionSample {
  ratio: number;
  visibleHeight: number;
  elementHeight: number;
  viewportHeight: number;
}

/** Murni: apakah irisan bubble dengan viewport cukup untuk dianggap dilihat. */
export function isEnoughVisible(s: IntersectionSample): boolean {
  if (s.ratio >= MESSAGE.VIEW_THRESHOLD) return true;
  const needed = MESSAGE.VIEW_THRESHOLD * Math.min(s.elementHeight, s.viewportHeight);
  return s.viewportHeight > 0 && s.visibleHeight >= needed;
}

const pageIsFocused = (): boolean => document.visibilityState === 'visible' && document.hasFocus();

/** Svelte action: panggil onSeen sekali, saat syarat "dilihat" terpenuhi. */
export function seen(node: HTMLElement, initial: SeenParams) {
  let params = initial;
  let enough = false;
  let fired = false;
  const check = () => {
    if (!fired && params.enabled && enough && pageIsFocused()) {
      fired = true;
      params.onSeen();
    }
  };
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry) return;
      enough = isEnoughVisible({
        ratio: entry.intersectionRatio,
        visibleHeight: entry.intersectionRect.height,
        elementHeight: entry.boundingClientRect.height,
        viewportHeight: entry.rootBounds?.height ?? innerHeight,
      });
      check();
    },
    { threshold: [0, 0.25, 0.5, 0.75, 1] },
  );
  observer.observe(node);
  addEventListener('focus', check);
  document.addEventListener('visibilitychange', check);
  return {
    update(next: SeenParams) {
      params = next;
      check();
    },
    destroy() {
      observer.disconnect();
      removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    },
  };
}
