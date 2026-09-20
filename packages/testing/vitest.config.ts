import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Pure-function unit tests for the DB isolation helpers, plus harness specs that
// boot an Application. Node pool, no Postgres, no workerd — real database
// behaviour is exercised by the framework e2e suite.
export default defineConfig({
  resolve: {
    alias: {
      // `cloudflare:workers` is a Workers runtime built-in with no Node
      // resolution, and `stratal/cache` imports it statically. Point it at this
      // package's own stub by path: the self-referential
      // `@stratal/testing/mocks/cloudflare-workers` specifier consumers use
      // resolves through `exports` to `dist`, which would make this suite
      // depend on the package having been built first.
      'cloudflare:workers': fileURLToPath(new URL('./src/mocks/cloudflare-workers.ts', import.meta.url)),
    },
  },
  test: {
    name: 'unit',
    environment: 'node',
    include: ['src/**/__tests__/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
})
