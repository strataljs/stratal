import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { EnvironmentOptions, Plugin } from 'vite';
import { stratalInertiaDevCss } from './vite/inertia-dev-css-plugin';
import { stratalInertiaTypes } from './vite/inertia-types-plugin';

export { stratalInertiaDevCss, stratalInertiaTypes };

export interface StratalInertiaPluginOptions {
  /** Client entry path(s) for CSS collection (default: ['/src/inertia/app.tsx']) */
  entries?: string[]
  /**
   * Whether to emit sourcemaps in `vite build`. Default: `'dev-and-staging'`
   * — sourcemaps in development and staging deploys for debugging, but never
   * in production (which would inflate the worker upload).
   *
   * - `true` / `false` — force on / off
   * - `'dev-and-staging'` — on unless `CLOUDFLARE_ENV === 'prod'`
   */
  sourcemap?: boolean | 'dev-and-staging'
  /**
   * Path (relative to project root) to the Vite client manifest emitted by
   * the standalone browser-bundle build phase. The injector plugin reads it
   * during the worker build and inlines it onto the worker entry chunk so
   * `ManifestService` can resolve hashed asset URLs at runtime.
   *
   * Default: `'dist/client/.vite/manifest.json'` — matches the layout
   * `quarry inertia:build` produces.
   */
  clientManifestPath?: string
}

export function stratalInertia(options?: StratalInertiaPluginOptions): Plugin[] {
  const entries = options?.entries ?? ['/src/inertia/app.tsx']
  const sourcemapOption = options?.sourcemap ?? 'dev-and-staging'
  const sourcemap = sourcemapOption === 'dev-and-staging'
    ? process.env.CLOUDFLARE_ENV !== 'prod' && process.env.CLOUDFLARE_ENV! !== 'production'
    : sourcemapOption

  // Hono and stratal must NOT be pre-bundled by Vite's optimizeDeps. When they are,
  // a duplicate copy ends up in `.vite/deps_<env>/` while the worker bundle imports
  // another copy from node_modules — Response objects from one instance flow into
  // a Context class from the other, and Hono's `set res` setter crashes inside
  // `this.#res.headers.entries()` because the prototype chain doesn't match.
  //
  // React 19 ships its main entry as CJS and relies on the optimizer's CJS→ESM
  // conversion, so it cannot be excluded outright. To prevent the related
  // identity-mismatch bug (two `?v=<hash>` copies after the optimizer re-runs
  // when a new dep is auto-discovered), the React-ecosystem packages are listed
  // in `resolve.noExternal` so Vite treats them as part of the user module graph
  // and `resolve.dedupe` so all imports collapse to a single physical copy.
  const optimizeDepsExclude = [
    '@cloudflare/vite-plugin',
    'wrangler',
    'blake3-wasm',
    '@stratal/inertia',
    'stratal',
    'hono',
    '@hono/zod-openapi',
    '@hono/swagger-ui',
  ]
  const dedupe = [
    'react',
    'react-dom',
    'react-is',
    'scheduler',
    '@inertiajs/core',
    '@inertiajs/react',
  ]
  const noExternal = [
    'react',
    'react-dom',
    'react-is',
    'scheduler',
    'use-sync-external-store',
    '@inertiajs/core',
    '@inertiajs/react',
  ]
  const optimizeDepsInclude = ['buffer', 'buffer/', 'base64-js', 'ieee754']
  // Dev/build-time-only packages that must never reach the worker or browser
  // bundle. `ts-morph` is used by the type generator. The langium / zenstack
  // CLI/SDK group is dragged in transitively by ZenStack's runtime barrel
  // (e.g. `@zenstackhq/better-auth` imports a `schema-generator` that
  // references `@zenstackhq/language` which depends on `langium`); no actual
  // runtime code path executes any of it. If a future refactor genuinely
  // needs one of these at runtime, this list should be revisited explicitly.
  const devOnlyExternals: (string | RegExp)[] = [
    'ts-morph',
    /^langium($|\/)/,
    /^@zenstackhq\/cli($|\/)/,
    /^@zenstackhq\/language($|\/)/,
    /^@zenstackhq\/sdk($|\/)/,
  ]

  const clientManifestPath = options?.clientManifestPath ?? 'dist/client/.vite/manifest.json'

  return [
    stratalInertiaDevCss({ entries }),
    stratalInertiaTypes(),
    {
      name: 'stratal:optimize-deps-fix',
      configEnvironment(name: string, env: EnvironmentOptions) {
        const existing = env.optimizeDeps?.exclude ?? []
        const existingInclude = env.optimizeDeps?.include ?? []
        env.optimizeDeps = {
          ...env.optimizeDeps,
          exclude: [...existing, ...optimizeDepsExclude],
          include: [...existingInclude, ...optimizeDepsInclude],
        }

        const existingDedupe = env.resolve?.dedupe ?? []
        const existingNoExternal = env.resolve?.noExternal
        const mergedNoExternal: (string | RegExp)[] = [
          ...(Array.isArray(existingNoExternal)
            ? existingNoExternal
            : typeof existingNoExternal === 'string' || existingNoExternal instanceof RegExp
              ? [existingNoExternal]
              : []),
          ...noExternal,
        ]
        env.resolve = {
          ...env.resolve,
          dedupe: [...existingDedupe, ...dedupe],
          noExternal: existingNoExternal === true ? true : mergedNoExternal,
        }

        const existingExternal = env.build?.rolldownOptions?.external
        const existingExternalArray: (string | RegExp)[] = Array.isArray(existingExternal)
          ? (existingExternal as (string | RegExp)[])
          : existingExternal != null
            ? [existingExternal as string | RegExp]
            : []
        env.build = {
          ...env.build,
          // Only override sourcemap when the user hasn't set it explicitly,
          // so a per-app `build.sourcemap` in vite.config.ts still wins.
          sourcemap: env.build?.sourcemap ?? sourcemap,
          rolldownOptions: {
            ...env.build?.rolldownOptions,
            external: [...existingExternalArray, ...devOnlyExternals],
          },
        }

        // `quarry inertia:build` runs a standalone client build (phase 1) that
        // emits the browser bundle + manifest to dist/client/ before invoking
        // this worker build (phase 2). `@cloudflare/vite-plugin`'s `buildApp`
        // then runs a "fallback" build for its own `client` env (because no
        // input is set on it here) which, with Vite's default
        // `build.emptyOutDir = true` for in-root outDirs, would wipe phase 1's
        // chunks. Pinning `emptyOutDir = false` for the client env preserves
        // the browser bundle so CF's asset binding can serve `/assets/app-<hash>.js`.
        if (name === 'client') {
          env.build.emptyOutDir = false
        }
      },
    },
    invokeReflectMetadataBeforeTsyringeCheck(),
    injectClientManifestIntoWorker({ clientManifestPath }),
  ]
}

// Reads the manifest produced by the standalone browser-bundle build (run
// before this build by `quarry inertia:build`) and inlines it onto the worker
// entry chunk as `globalThis.__STRATAL_INERTIA_MANIFEST__`. The manifest must
// be inlined in the bundle itself — Cloudflare Workers have no filesystem at
// runtime — so `ManifestService` can resolve hashed asset URLs without any
// consumer-side wiring.
function injectClientManifestIntoWorker(args: { clientManifestPath: string }): Plugin {
  let projectRoot = process.cwd()

  return {
    name: 'stratal:inertia-inject-manifest',
    apply: 'build',
    configResolved(config) {
      projectRoot = config.root
    },
    generateBundle(_options, bundle) {
      // Only inject into worker / SSR bundles. The browser-bundle build runs
      // in a separate `vite build` invocation and never reaches this plugin.
      if (this.environment.name === 'client') return

      const manifestPath = isAbsolute(args.clientManifestPath)
        ? args.clientManifestPath
        : join(projectRoot, args.clientManifestPath)

      if (!existsSync(manifestPath)) {
        this.error(
          '@stratal/inertia: client manifest not found at ' + manifestPath
          + '. Run `quarry inertia:build` to build the browser bundle before deploying.',
        )
      }

      const manifestJson = readFileSync(manifestPath, 'utf-8')
      // Parse + re-stringify so a malformed manifest fails loudly here rather
      // than at worker boot, and so the inlined value is normalized.
      const manifest = JSON.parse(manifestJson) as unknown
      const inlined = JSON.stringify(manifest)
      const sentinel = 'globalThis.__STRATAL_INERTIA_MANIFEST__'

      for (const fileName of Object.keys(bundle)) {
        const chunk = bundle[fileName]
        if (chunk.type !== 'chunk') continue
        if (!chunk.isEntry) continue
        if (chunk.code.startsWith(sentinel)) continue
        chunk.code = `${sentinel} = ${inlined};\n${chunk.code}`
      }
    },
  }
}

// Stratal relies on tsyringe for dependency injection. Rolldown wraps
// `reflect-metadata` as a lazy CJS module, so `import "reflect-metadata"` at the
// top of the worker entry only DEFINES `require_Reflect()` without invoking it.
// tsyringe's main module body runs
//   `if (typeof Reflect === "undefined" || !Reflect.getMetadata) throw new Error("tsyringe requires a reflect polyfill ...");`
// at load time, so when production builds split the bundle into ESM chunks
// (Cloudflare Workers ESM allows multiple chunks) and tsyringe's chunk happens
// to evaluate before any chunk invokes the polyfill, the worker crashes on
// boot. The Vite dev server doesn't chunk, so this only surfaces on deploy.
//
// `manualChunks` co-locates reflect-metadata and tsyringe in a single chunk so
// the polyfill declaration and the runtime check sit in the same module. The
// `generateBundle` hook then prepends an explicit `require_Reflect$X();` to
// each tsyringe check so the lazy CJS wrapper actually runs first.
function invokeReflectMetadataBeforeTsyringeCheck(): Plugin {
  const TSYRINGE_CHECK = /if \(typeof Reflect === "undefined" \|\| !Reflect\.getMetadata\) throw new Error\("tsyringe requires a reflect polyfill[\s\S]*?\);/
  const REFLECT_DECL = /var (require_Reflect\$?\d*) = \/\* @__PURE__ \*\/ __commonJSMin/

  return {
    name: 'stratal:invoke-reflect-metadata-before-tsyringe',
    apply: 'build',
    configEnvironment(_name: string, env: EnvironmentOptions) {
      const rawOutput = env.build?.rolldownOptions?.output
      if (Array.isArray(rawOutput)) {
        throw new Error('stratal:invoke-reflect-metadata-before-tsyringe does not support array-form rolldownOptions.output')
      }
      const existingOutput = rawOutput ?? {}
      const userManualChunks = existingOutput.manualChunks
      env.build = {
        ...env.build,
        rolldownOptions: {
          ...env.build?.rolldownOptions,
          output: {
            ...existingOutput,
            manualChunks(id: string, meta: unknown) {
              if (typeof userManualChunks === 'function') {
                const userResult = (userManualChunks as (id: string, meta: unknown) => string | null | undefined)(id, meta)
                if (userResult != null) return userResult
              } else if (userManualChunks && typeof userManualChunks === 'object') {
                for (const [name, ids] of Object.entries(userManualChunks as Record<string, string[]>)) {
                  if (Array.isArray(ids) && ids.some((entry) => id.includes(entry))) return name
                }
              }
              if (id.includes('/reflect-metadata/') || id.includes('/tsyringe/')) {
                return 'stratal-reflect-metadata'
              }
            },
          },
        },
      }
    },
    generateBundle(_, bundle) {
      for (const fileName of Object.keys(bundle)) {
        const chunk = bundle[fileName]
        if (chunk.type !== 'chunk') continue
        let modified = chunk.code
        let injected = false
        let cursor = 0
        while (true) {
          const matchOffset = modified.slice(cursor).search(TSYRINGE_CHECK)
          if (matchOffset === -1) break
          const checkIndex = cursor + matchOffset
          const declMatch = modified.slice(0, checkIndex).match(REFLECT_DECL)
          if (!declMatch) {
            this.error(`stratal: tsyringe runtime check found in chunk ${fileName} but reflect-metadata polyfill is not declared earlier in the same chunk. Something is overriding the manualChunks configuration that co-locates them.`)
          }
          const invocation = `${declMatch[1]}();\n`
          modified = modified.slice(0, checkIndex) + invocation + modified.slice(checkIndex)
          cursor = checkIndex + invocation.length + 1
          injected = true
        }
        if (injected) chunk.code = modified
      }
    },
  }
}
