import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte()],
  build: {
    target: 'es2022',
    // CSP ketat (PRD §11.1): tidak ada aset yang di-inline sebagai data: atau <style>.
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
