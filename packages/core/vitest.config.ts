import { defineConfig } from 'vitest/config'

export default defineConfig({
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
    ],
  },
})
