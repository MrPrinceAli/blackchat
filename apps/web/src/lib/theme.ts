// Preferensi tema: satu-satunya data di localStorage (PRD §10.2, §12 aturan 6).
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
