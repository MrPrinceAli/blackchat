// Konfigurasi terpisah untuk gambar README (pnpm readme:assets): server sama dengan E2E, test berbeda.
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import base from '../../playwright.config';

const root = fileURLToPath(new URL('../..', import.meta.url));
const servers = Array.isArray(base.webServer) ? base.webServer : [];

export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: '*.shots.ts',
  timeout: 120_000,
  webServer: servers.map((server) => ({ ...server, cwd: root })),
  projects: [{ name: 'readme', use: { browserName: 'chromium' } }],
});
