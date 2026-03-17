import { createRequire } from 'node:module'
import path from 'node:path'

import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import type { Plugin, UserConfig } from 'vite'

const require = createRequire(import.meta.url)

type CloudflareTestOptions = Parameters<typeof cloudflareTest>[0]

const pgCjsResolvers = new Map<string, () => string>([
  ['pg-protocol', () => require.resolve('pg-protocol')],
  ['pg-connection-string', () => require.resolve('pg-connection-string')],
  ['pg-pool', () => require.resolve('pg-pool')],
  ['pg-cloudflare', () => path.join(path.dirname(require.resolve('pg-cloudflare')), 'index.js')],
])

/**
 * Returns a Vite plugin that forces CJS resolution for `pg` sub-dependencies.
 *
 * `pg` is CJS but its dependencies (`pg-protocol`, `pg-connection-string`, `pg-pool`) ship
 * dual CJS/ESM exports. In workerd, the module fallback resolver prefers the ESM condition,
 * causing `SyntaxError: Cannot use import statement outside a module` when CJS `pg` does
 * `require()`. Additionally, `pg-cloudflare` uses a `workerd` export condition that the
 * root Vite instance doesn't resolve.
 *
 * Must be used at the **root** `defineConfig` level so that the
 * `@cloudflare/vitest-pool-workers` module fallback resolver (which uses the root Vite
 * instance) resolves pg sub-deps correctly.
 *
 * @example
 * ```ts
 * import { fixPgCjs, stratalTest } from '@stratal/testing/vitest-plugin'
 * import { defineConfig } from 'vitest/config'
 *
 * export default defineConfig({
 *   plugins: [fixPgCjs()],
 *   test: {
 *     projects: [{
 *       plugins: [stratalTest({ wrangler: { configPath: './wrangler.jsonc' } })],
 *       test: { name: 'e2e', include: ['test/e2e/**\/*.spec.ts'] },
 *     }],
 *   },
 * })
 * ```
 */
export const fixPgCjs = (): Plugin => ({
  name: 'stratal-pg-cjs',
  enforce: 'pre',
  resolveId(id) {
    const resolver = pgCjsResolvers.get(id)
    if (!resolver) return
    try {
      return resolver()
    } catch {
      return
    }
  },
})

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
          nodemailer: '@stratal/testing/mocks/nodemailer',
        },
      },
      ssr: {
        noExternal: ['@zenstackhq/better-auth'],
      },
    } satisfies UserConfig
  },
}

/**
 * Returns Vite plugins for Stratal tests running in the Cloudflare Workers (workerd) environment.
 *
 * Includes the cloudflare pool plugin and Stratal alias plugin.
 * Use inside a project-level `plugins` array.
 *
 * **Note:** `fixPgCjs()` must be registered separately at the root `defineConfig` level.
 *
 * @param options - Same options as `cloudflareTest()` from `@cloudflare/vitest-pool-workers`
 * @returns An array of Vite plugins
 */
export function stratalTest(options: CloudflareTestOptions = {}): Plugin[] {
  return [cloudflareTest(options), stratalPlugin]
}
