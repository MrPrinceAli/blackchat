import { defineConfig } from 'vitest/config';

// W0: test unit biasa di Node. W4 beralih ke @cloudflare/vitest-pool-workers.
export default defineConfig({
  define: { __BC_TEST__: 'true' },
  test: { include: ['test/**/*.test.ts'] },
});
