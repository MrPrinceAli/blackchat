import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = 4173;
const RELAY_PORT = 8787;

export default defineConfig({
  testDir: 'e2e',
  // Satu worker: jam relay (D-006) dan rate limit dipakai bersama oleh semua test.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    // Suite E2E memakai teks Indonesia (bahasa default aplikasi Inggris, D-024; diuji di smoke.spec.ts).
    storageState: {
      cookies: [],
      origins: [
        {
          origin: `http://localhost:${WEB_PORT}`,
          localStorage: [{ name: 'bc.lang', value: 'id' }],
        },
      ],
    },
  },
  projects: [
    {
      name: 'mobile-320',
      use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 568 }, hasTouch: true },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    // Opsional (E2E_WEBKIT=1): mesin Safari, untuk mengukur Argon2id dan memeriksa kompatibilitas.
    ...(process.env['E2E_WEBKIT']
      ? [{ name: 'webkit-iphone', use: { ...devices['iPhone 13'] } }]
      : []),
  ],
  webServer: [
    {
      // Relay lokal (wrangler dev, env test): D1 & Durable Objects lokal yang selalu mulai kosong (D-005).
      command: 'pnpm --filter @blackchat/relay e2e:serve',
      url: `http://localhost:${RELAY_PORT}/v1/account/salt?u=probe`,
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
    {
      // Build produksi + preview dengan header CSP yang sama dengan vercel.json (D-014).
      command: `pnpm --filter @blackchat/web build && pnpm --filter @blackchat/web preview --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
  ],
});
