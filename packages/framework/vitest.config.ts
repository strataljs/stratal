import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

/**
 * Fix pg-cloudflare resolution in workerd vitest pool.
 * pg-cloudflare exports `default` → empty.js (no CloudflareSocket).
 * The `workerd` condition isn't matched during require() resolution,
 * so we force it to the real implementation.
 */
function fixPgCloudflare(): Plugin {
  const target = resolve(import.meta.dirname, '../../node_modules/pg-cloudflare/dist/index.js')

  return {
    name: 'fix-pg-cloudflare',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'pg-cloudflare' || id.endsWith('/pg-cloudflare')) {
        return target
      }
    },
  }
}

export default defineConfig({
  plugins: [fixPgCloudflare()],
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
      defineWorkersConfig({
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.spec.ts'],
          setupFiles: ['./test/setup.ts'],
          globalSetup: ['./test/global-setup.ts'],
          poolOptions: {
            workers: {
              wrangler: { configPath: './test/wrangler.jsonc' },
              miniflare: {
                hyperdrives: {
                  DB: 'postgres://stratal:stratal_test@localhost:5438/stratal_test',
                },
              },
              singleWorker: true,
              isolatedStorage: true,
            },
          },
        },
        resolve: {
          alias: {
            '@zenstackhq/language/ast': '@stratal/testing/mocks/zenstack-language',
            '@zenstackhq/language/utils': '@stratal/testing/mocks/zenstack-language',
            '@zenstackhq/language': '@stratal/testing/mocks/zenstack-language',
          },
        },
        ssr: {
          noExternal: ['@zenstackhq/better-auth'],
        },
      })
    ],
  },
})
