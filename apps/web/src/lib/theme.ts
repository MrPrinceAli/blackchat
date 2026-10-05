// Preferensi tampilan: tema dan bahasa, satu-satunya data di localStorage (PRD §10.2, §12 aturan 6; D-024).
export type ThemePreference = 'system' | 'dark' | 'light';

const KEY = 'bc.theme';

export function readTheme(): ThemePreference {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'dark' || value === 'light' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(
  preference: ThemePreference,
  root: HTMLElement = document.documentElement,
): void {
  if (preference === 'system') delete root.dataset['theme'];
  else root.dataset['theme'] = preference;
}

export function saveTheme(preference: ThemePreference): void {
  try {
    if (preference === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, preference);
  } catch {
    // Storage diblokir (mode privat): tema tetap berlaku untuk sesi ini saja.
  }
  applyTheme(preference);
}

// ================================================================ bahasa (D-024)

export type Lang = 'en' | 'id';
const LANG_KEY = 'bc.lang';

/** Bahasa tersimpan; default Inggris. */
export function readLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === 'id' ? 'id' : 'en';
  } catch {
    return 'en';
  }
}

export function saveLang(lang: Lang): void {
  try {
    if (lang === 'en') localStorage.removeItem(LANG_KEY);
    else localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Storage diblokir (mode privat): bahasa tetap berlaku untuk sesi ini saja.
  }
}
