import { svelte } from '@sveltejs/vite-plugin-svelte';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig, loadEnv } from 'vite';
import { securityHeaders } from './security-headers.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const relayUrl = env['VITE_RELAY_URL'] ?? 'http://localhost:8787';
  return {
    plugins: [svelte()],
    build: {
      target: 'es2022',
      // CSP ketat (PRD §11.1): tidak ada aset yang di-inline sebagai data: atau <style>.
      assetsInlineLimit: 0,
      modulePreload: { polyfill: false },
    },
    preview: {
      headers: securityHeaders(relayUrl),
    },
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            include: ['src/**/*.test.ts'],
            exclude: ['src/**/*.browser.test.ts'],
          },
        },
        {
          // Test yang butuh browser sungguhan (canvas, createImageBitmap, encoder gambar).
          extends: true,
          test: {
            name: 'browser',
            include: ['src/**/*.browser.test.ts'],
            browser: {
              enabled: true,
              headless: true,
              provider: playwright(),
              instances: [{ browser: 'chromium' }],
            },
          },
        },
      ],
    },
  };
});
