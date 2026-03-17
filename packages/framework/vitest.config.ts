import { fixPgCjs, stratalTest } from '@stratal/testing/vitest-plugin'
import { defineConfig } from 'vitest/config'

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
        },
      },
      {
        plugins: [
          stratalTest({
            wrangler: { configPath: './test/wrangler.jsonc' },
            miniflare: {
              hyperdrives: {
                DB: 'postgres://stratal:stratal_test@localhost:5438/stratal_test',
              },
            },
          }),
        ],
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.spec.ts'],
          setupFiles: ['./test/setup.ts'],
          globalSetup: ['./test/global-setup.ts'],
          fileParallelism: false,
          isolate: false,
        },
      },
    ],
  },
})
