import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // `stratal/cache` (reached transitively through `@stratal/testing`) statically
    // imports the Workers-only `cloudflare:workers` built-in; alias it to a
    // Node-loadable stub. Every spec here runs in Node, so applying it globally
    // is safe.
    alias: { 'cloudflare:workers': '@stratal/testing/mocks/cloudflare-workers' },
  },
  test: {
    name: 'unit',
    environment: 'node',
    include: ['src/**/__tests__/**/*.spec.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    globals: true,
  },
})
