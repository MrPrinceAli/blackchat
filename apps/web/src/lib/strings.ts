// Semua teks UI, dalam bahasa aktif (D-024): Inggris (default) atau Indonesia.
// Membaca `strings.x.y` di template/derived ikut terlacak, jadi UI berganti saat bahasa diganti.
import { locale } from './i18n.svelte';
import { en } from './strings.en';
import { id, type Strings } from './strings.id';

export type { Strings };

export const strings: Strings = new Proxy({} as Strings, {
  get: (_target, key) => (locale.current === 'id' ? id : en)[key as keyof Strings],
});
