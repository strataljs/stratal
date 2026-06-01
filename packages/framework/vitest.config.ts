import { fixPgCjs, stratalTest } from '@stratal/testing/vitest-plugin';
import { defineConfig } from 'vitest/config';

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run framework e2e tests. Set it in packages/framework/.env (loaded via `npx dotenv`).')
}

export default defineConfig({
  plugins: [fixPgCjs()],
  test: {
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        '**/__tests__/**',
        '**/*.spec.ts',
        '**/index.ts',
        '**/types.ts',
        '**/tokens.ts',
      ],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/__tests__/**/*.spec.ts'],
          exclude: ['**/node_modules/**', '**/dist/**'],
          setupFiles: ['./vitest.setup.ts'],
          globals: true,
          sequence: { groupOrder: 0 },
        },
      },
      {
        plugins: [
          stratalTest({
            wrangler: { configPath: './test/wrangler.jsonc' },
            miniflare: {
              hyperdrives: {
                // Single source of truth shared with global setup. The Hyperdrive
                // env-var override is wrangler-dev-only and ignored in tests.
                DB: DATABASE_URL,
              },
            },
            // Each test file gets its own database cloned from the migrated
            // template; enables file parallelism. Set to 'shared' to opt out.
            database: { isolation: 'database' },
          }),
        ],
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.spec.ts'],
          setupFiles: ['./test/setup.ts'],
          globalSetup: ['./test/global-setup.ts'],
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
})
