import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'
import { resolve } from 'node:path'

export default defineWorkersConfig({
  resolve: {
    alias: {
      tslib: resolve(import.meta.dirname, 'node_modules/tsyringe/node_modules/tslib/tslib.es6.js'),
    },
  },
  test: {
    setupFiles: ['./vitest.setup.ts'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
      },
    },
  },
})
