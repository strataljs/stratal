import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  test: {
    name: 'workerd',
    include: ['integration/**/*.spec.ts'],
    setupFiles: ['./setup.ts'],
    benchmark: {
      include: [],
    },
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
      },
    },
  },
})
