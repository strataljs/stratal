import { stratalTest } from '@stratal/testing/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [stratalTest({ wrangler: { configPath: './wrangler.jsonc' } })],
  test: {
    name: 'workerd',
    include: ['integration/**/*.spec.ts'],
    setupFiles: ['./setup.ts'],
    // The first test in a file pays that file's one-time warm-up — the
    // workerd pool booting a real Miniflare module graph, on top of the
    // decorator/reflect-metadata and DI container cost every Application
    // boot carries. Later tests in the same file run in single-digit
    // milliseconds. That cost is charged to whichever test runs first, so
    // this budget covers it on a cold, contended runner while still failing
    // a genuinely hung test quickly.
    testTimeout: 30_000,
    benchmark: {
      include: [],
    },
  },
})
