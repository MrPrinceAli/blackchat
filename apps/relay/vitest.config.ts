import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// Test berjalan di dalam workerd (Miniflare) dengan wrangler env "test" (D-005, D-006).
export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.toml', environment: 'test' },
        miniflare: {
          bindings: {
            // Rahasia khusus test, bukan rahasia produksi.
            SALT_SECRET: '5a'.repeat(32),
            TEST_MIGRATIONS: migrations,
          },
        },
      }),
    ],
    define: { __BC_TEST__: 'true' },
    test: {
      include: ['test/**/*.test.ts'],
      setupFiles: ['./test/setup.ts'],
    },
  };
});
