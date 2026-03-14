import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import type { Plugin, UserConfig } from 'vite'

type CloudflareTestOptions = Parameters<typeof cloudflareTest>[0]

/**
 * Unified Vite plugin for Stratal tests running in the Cloudflare Workers (workerd) environment.
 *
 * Wraps `cloudflareTest` from `@cloudflare/vitest-pool-workers` and applies Stratal-specific
 * defaults: tslib alias for tsyringe, ZenStack language mocks, and SSR externals config.
 *
 * @param options - Same options as `cloudflareTest()` from `@cloudflare/vitest-pool-workers`
 * @returns An array of Vite plugins
 *
 * @example
 * ```ts
 * import { stratalTest } from '@stratal/testing/vitest-plugin'
 * import { defineConfig } from 'vitest/config'
 *
 * export default defineConfig({
 *   plugins: [stratalTest({ wrangler: { configPath: './wrangler.jsonc' } })],
 *   test: {
 *     include: ['test/e2e/**\/*.spec.ts'],
 *   },
 * })
 * ```
 */
export function stratalTest(options: CloudflareTestOptions = {}): Plugin[] {
  const cfPlugin = cloudflareTest(options)

  const stratalPlugin: Plugin = {
    name: 'stratal-test',
    config() {
      return {
        resolve: {
          alias: {
            tslib: 'tsyringe/node_modules/tslib/tslib.es6.js',
            '@zenstackhq/language/ast': '@stratal/testing/mocks/zenstack-language',
            '@zenstackhq/language/utils': '@stratal/testing/mocks/zenstack-language',
            '@zenstackhq/language': '@stratal/testing/mocks/zenstack-language',
          },
        },
        ssr: {
          noExternal: ['@zenstackhq/better-auth'],
        },
      } satisfies UserConfig
    },
  }

  return [cfPlugin, stratalPlugin]
}
