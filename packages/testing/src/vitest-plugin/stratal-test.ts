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

/**
 * Returns a Vite plugin that forces CJS resolution for `@noble/hashes` subpaths
 * used by `@paralleldrive/cuid2@2.x` (the version `@zenstackhq/orm` depends on).
 *
 * cuid2@2.x is CJS and does `require("@noble/hashes/sha3")` without the `.js`
 * extension. In a workspace that also installs `@noble/hashes@2.x` (ESM-only),
 * the hoisted v2 package has no extensionless `./sha3` entry in its exports
 * map, so Vite/workerd resolution fails. This plugin routes the extensionless
 * subpaths through the consumer's nested `@noble/hashes@1.x` (a sibling of
 * cuid2 under `@zenstackhq/orm/node_modules`), which ships proper CJS exports.
 *
 * If the consumer doesn't depend on `@zenstackhq/orm`, the plugin is a no-op.
 * Otherwise it throws loudly at config-resolution time if the resolution chain
 * is unexpectedly broken — surfacing dependency drift instead of letting the
 * symptom resurface as an opaque test failure.
 *
 * Must be used at the **root** `defineConfig` level (same constraint as
 * `fixPgCjs`).
 *
 * @example
 * ```ts
 * import { fixNobleHashesCjs, fixPgCjs, stratalTest } from '@stratal/testing/vitest-plugin'
 *
 * export default defineConfig({
 *   plugins: [fixPgCjs(), fixNobleHashesCjs()],
 *   // ...
 * })
 * ```
 */
export const fixNobleHashesCjs = (): Plugin => {
  const ids = ['@noble/hashes/sha3', '@noble/hashes/crypto']
  let resolved: Map<string, string> | null = null

  return {
    name: 'stratal-noble-hashes-cjs',
    enforce: 'pre',
    configResolved(config) {
      const consumerRequire = createRequire(path.join(config.root, 'noop.js'))
      let zenstackPath: string
      try {
        zenstackPath = consumerRequire.resolve('@zenstackhq/orm')
      } catch {
        // Consumer doesn't use ZenStack — nothing to fix.
        return
      }
      const cuid2Path = createRequire(zenstackPath).resolve('@paralleldrive/cuid2')
      const cuid2Require = createRequire(cuid2Path)
      resolved = new Map<string, string>(
        ids.map((id) => [id, cuid2Require.resolve(id)]),
      )
    },
    resolveId(id) {
      return resolved?.get(id)
    },
  }
}

const stratalPlugin: Plugin = {
  name: 'stratal-test',
  config() {
    return {
      resolve: {
        alias: {
          tslib: 'tslib/tslib.es6.mjs',
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
  return [cloudflareTest(options) as unknown as Plugin, stratalPlugin]
}
