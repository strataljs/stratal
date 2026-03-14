import { stratalTest } from '@stratal/testing/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [stratalTest({ wrangler: { configPath: './wrangler.jsonc' } })],
  test: {
    name: 'workerd',
    include: ['integration/**/*.spec.ts'],
    setupFiles: ['./setup.ts'],
    benchmark: {
      include: [],
    },
  },
})
