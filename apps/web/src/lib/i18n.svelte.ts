// Bahasa aktif (D-024). Reaktif: semua teks dari `strings` ikut berganti tanpa memuat ulang.
import { readLang, saveLang, type Lang } from './theme';

export const locale = $state<{ current: Lang }>({ current: 'en' });

/** Baca preferensi tersimpan saat aplikasi mulai. */
export function initLang(): void {
  setLang(readLang(), false);
}

export function setLang(lang: Lang, persist = true): void {
  locale.current = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  if (persist) saveLang(lang);
}
