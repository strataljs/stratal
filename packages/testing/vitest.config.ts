import { defineConfig } from 'vitest/config'

// Pure-function unit tests for the DB isolation helpers. Node pool, no Postgres,
// no workerd — real database behaviour is exercised by the framework e2e suite.
export default defineConfig({
  test: {
    name: 'unit',
    environment: 'node',
    include: ['src/**/__tests__/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
})
