import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// Unit tests run anywhere. Integration tests (tests/integration) need a
// Postgres reachable through TEST_DATABASE_URL and skip themselves otherwise —
// they must never point at the production database.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Integration suites share one database; run files serially.
    fileParallelism: false,
    reporters: process.env.CI ? ['default', 'junit'] : ['default'],
    outputFile: { junit: 'test-results/junit.xml' },
  },
});
