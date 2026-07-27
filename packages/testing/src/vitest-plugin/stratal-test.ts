import { createRequire } from 'node:module'
import path from 'node:path'

import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import type { StratalEnv } from 'stratal'
import type { Plugin, UserConfig } from 'vite'
import type { TestUserConfig } from 'vitest/config'
import { DB_SHARED_POOL_ENV } from '@stratal/framework/database'
import { BINDING_ENV_VAR, DEFAULT_DB_BINDING } from '../database'

const require = createRequire(import.meta.url)

type CloudflareTestOptions = Parameters<typeof cloudflareTest>[0]

/** String keys of `StratalEnv` whose value is a Hyperdrive binding. */
type HyperdriveKeys = Extract<
  { [K in keyof StratalEnv]-?: StratalEnv[K] extends Hyperdrive ? K : never }[keyof StratalEnv],
  string
>

/**
 * Names of declared Hyperdrive bindings, drawn from the consumer's augmented
 * `StratalEnv` (which extends `Cloudflare.Env`). Falls back to `string` only
 * when no Hyperdrive binding is declared (nothing to constrain to).
 */
type HyperdriveBindingName = [HyperdriveKeys] extends [never] ? string : HyperdriveKeys

/** Stratal per-worker database configuration for {@link stratalTest}. */
export interface StratalTestDatabaseOptions {
  /**
   * Name of the Hyperdrive binding to point at this worker's database.
   * Defaults to `'DB'`. Constrained to declared Hyperdrive bindings.
   */
  binding?: HyperdriveBindingName
}

type WorkersPoolOptions = Exclude<CloudflareTestOptions, (...args: never[]) => unknown>
type StratalTestOptions = WorkersPoolOptions & { database?: StratalTestDatabaseOptions }

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

const createStratalPlugin = (databaseEnabled: boolean): Plugin => ({
  name: 'stratal-test',
  config() {
    const config: UserConfig & { test?: TestUserConfig } = {
      resolve: {
        alias: {
          tslib: 'tslib/tslib.es6.mjs',
          '@zenstackhq/language/ast': '@stratal/testing/mocks/zenstack-language',
          '@zenstackhq/language/utils': '@stratal/testing/mocks/zenstack-language',
          '@zenstackhq/language': '@stratal/testing/mocks/zenstack-language',
        },
      },
      ssr: {
        noExternal: ['@zenstackhq/better-auth'],
      },
    }
    // Per-file DB isolation requires real file parallelism; each file gets its
    // own database, cloned from the migrated template, and resets between
    // tests. Setup hooks do real DB work (the clone itself — a
    // `CREATE DATABASE ... TEMPLATE` serialized across concurrent files by a
    // Postgres advisory lock — plus per-test tenant/seed provisioning in
    // `beforeAll`) that routinely exceeds Vitest's 10s default hook timeout
    // under a full worker slot — give a sensible floor. The advisory lock is
    // exactly the contention this timeout has to absorb, not a queue that's
    // been removed. Consumers with heavier setup override `hookTimeout` on
    // their own project.
    if (databaseEnabled) config.test = { fileParallelism: true, isolate: true, hookTimeout: 30_000 }
    return config
  },
})

/**
 * Returns Vite plugins for Stratal tests running in the Cloudflare Workers (workerd) environment.
 *
 * Includes the cloudflare pool plugin and Stratal alias plugin. Pass a
 * `database` option to give each worker its own database (cloned once from a
 * migrated template, reset between tests) and enable file parallelism. Use
 * inside a project-level `plugins` array.
 *
 * **Note:** `fixPgCjs()` must be registered separately at the root `defineConfig` level.
 *
 * @param options - `cloudflareTest()` options plus Stratal `database` options
 * @returns An array of Vite plugins
 */
export function stratalTest(options: StratalTestOptions = {}): Plugin[] {
  const { database, ...cfOptions } = options
  const databaseEnabled = database !== undefined
  const binding = database?.binding ?? DEFAULT_DB_BINDING

  // Inject the DB-isolation env ONLY when the consumer opted in via `database`.
  // Its presence is how the testing-module builder tells "isolation requested"
  // from "plain app" — so it can hard-error on `database: {}` with no connection
  // string instead of silently running parallel files without isolation.
  const dbEnv = databaseEnabled
    ? {
        [BINDING_ENV_VAR]: binding,
        // Run the consuming app's DB connections on ONE shared pool per
        // connection: the test runtime hits a direct Postgres with no Hyperdrive
        // to multiplex, so a fresh pool per request resolution would exhaust
        // `max_connections` across parallel files. The framework's
        // `createPoolFactory(env, …)` reads this and memoizes the pool; in
        // dev/staging/prod the flag is absent → fresh-per-resolution (Hyperdrive
        // multiplexes). See `@stratal/framework/database`.
        [DB_SHARED_POOL_ENV]: 'true',
      }
    : {}
  const merged = {
    ...cfOptions,
    miniflare: {
      ...cfOptions.miniflare,
      bindings: {
        ...(cfOptions.miniflare?.bindings as Record<string, unknown> | undefined),
        ...dbEnv,
      },
    },
  }
  return [cloudflareTest(merged), createStratalPlugin(databaseEnabled)]
}
