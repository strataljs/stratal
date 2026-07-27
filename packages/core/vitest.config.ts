import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // `cloudflare:workers` is a Workers runtime built-in with no Node
      // resolution. Point it at the shared stub from @stratal/testing so modules
      // importing it (e.g. CacheService's `waitUntil`) load under the node test
      // environment. Specs that mock it with vi.mock/vi.doMock still take precedence.
      'cloudflare:workers': '@stratal/testing/mocks/cloudflare-workers',
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        '**/__tests__/**',
        '**/__benchmarks__/**',
        '**/*.spec.ts',
        '**/*.bench.ts',
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
          env: { NO_COLOR: '1' },
          include: ['src/**/__tests__/**/*.spec.ts'],
          exclude: ['**/node_modules/**', '**/dist/**'],
          setupFiles: ['./vitest.setup.ts'],
          globals: true,
          benchmark: {
            include: ['src/**/__benchmarks__/**/*.bench.ts'],
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          environment: 'node',
          include: [],
          setupFiles: ['./vitest.setup.ts'],
          globals: true,
          benchmark: {
            include: ['test/benchmarks/**/*.bench.ts'],
          },
        },
      },
      './test/vitest.config.ts',
    ],
  },
})
