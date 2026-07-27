import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Alias, EnvironmentOptions, Plugin } from 'vite';
import { stratalInertiaDevCss } from './vite/inertia-dev-css-plugin';
import { stratalInertiaTypes } from './vite/inertia-types-plugin';

// Absolute path to the build-time stub that replaces react-dom's legacy
// synchronous server renderer in the worker SSR bundle (see the stub module
// and `reactDomServerLegacyAlias` for why). Resolves to the sibling
// `dist/react-dom-server-legacy-stub.mjs` of the built `dist/vite.mjs`.
const reactDomServerLegacyStub = fileURLToPath(
  new URL('./react-dom-server-legacy-stub.mjs', import.meta.url),
)

// react-dom/server (workerd → server.edge.js) CJS-`require()`s the synchronous
// legacy renderer alongside the streaming one; the require defeats tree-shaking,
// so the unused ~200 KB legacy build ships in every worker. Redirect it to the
// stub. The find matches the whole specifier (relative require or absolute id)
// so the replacement fully replaces it.
const reactDomServerLegacyAlias: Alias = {
  find: /^.*react-dom-server-legacy\.browser\.(?:production|development)\.js$/,
  replacement: reactDomServerLegacyStub,
}

// Packages reachable only through the optimize-excluded packages below — the
// data-layer ORM and the email renderer — ship CJS that the dep scanner never
// auto-discovers and that the workerd runner cannot evaluate. Force-optimize
// each, but only when it resolves from the project (both are optional).
const optionalCjsOptimizeTargets = ['@zenstackhq/orm', '@react-email/render']

// Subset of `specifiers` that resolves from `root`'s module graph.
function resolvableFrom(root: string, specifiers: string[]): string[] {
  const requireFrom = createRequire(join(root, 'package.json'))
  return specifiers.filter((specifier) => {
    try {
      requireFrom.resolve(specifier)
      return true
    } catch {
      return false
    }
  })
}

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
  /**
   * Page-component globs to exclude from server-side rendering, e.g.
   * `['Admin/**', 'Reports/Heavy']`. Patterns match Inertia component names —
   * the `./pages/<name>.tsx` glob key with the `./pages/` prefix and `.tsx`
   * suffix stripped:
   *
   * - `*`  matches a single path segment (no `/`)
   * - `**` matches any number of segments (including `/`)
   *
   * Excluded pages are dropped from the worker/SSR bundle entirely (smaller cold
   * start) and rendered client-only at runtime; the browser bundle still includes
   * them so they hydrate normally. Requires the conventional
   * `import.meta.glob('./pages/**\/*.tsx')` page resolver in the SSR entry.
   */
  ssrExclude?: string[]
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
    // `@stratal/framework` re-exports `stratal`'s DI tokens and Hono surface, so it must share their
    // module space. If the optimizer pre-bundles it while `stratal` is excluded, the bundled copy's
    // token identities diverge from the excluded `stratal`'s — and under a portal/symlinked checkout the
    // optimized `@stratal/framework/database` subpath even drops named exports (a guest SSR render then
    // throws "createPoolFactory is not a function"). Excluding it keeps it in one copy with `stratal`.
    '@stratal/framework',
    'hono',
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
  const optimizeDepsInclude = [
    'buffer',
    'buffer/',
    'base64-js',
    'ieee754',
    // `@stratal/inertia`'s SSR renderer imports the `react-dom/server` subpath. Because
    // `@stratal/inertia` is optimize-EXCLUDED above, the optimizer never crawls into it and so
    // never auto-discovers `react-dom/server`. React 19's `react-dom/server` is a CJS shim whose
    // conditional `require('./cjs/react-dom-server.<env>.<mode>.js')` only gets resolved by the
    // optimizer's CJS→ESM conversion — left undiscovered, that `require` reaches the workerd SSR
    // runner (which has no `require`) and every SSR page 500s with "require is not defined".
    // Force-optimizing the exact subpath makes esbuild convert it; the framework's import then
    // redirects to the converted copy. (Optimizing `react-dom` alone is not enough — the optimizer
    // keys on the specifier, and the import is `react-dom/server`, condition-resolved per env.)
    'react-dom/server',
    // Same mechanism as `react-dom/server`: CJS packages reachable only through the optimize-excluded
    // packages above, force-optimized when installed (see `optionalCjsOptimizeTargets`).
    ...resolvableFrom(process.cwd(), optionalCjsOptimizeTargets),
  ]
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
  const ssrExclude = options?.ssrExclude ?? []

  return [
    stratalInertiaDevCss({ entries }),
    stratalInertiaTypes(),
    ...(ssrExclude.length ? [excludeSsrPages({ patterns: ssrExclude })] : []),
    {
      name: 'stratal:optimize-deps-fix',
      config(config) {
        config.publicDir ??= 'src/inertia/public';

        // Strip react-dom's unused legacy synchronous renderer from every
        // build. `alias` must carry RegExp entries in array form; normalize an
        // existing object/array form before prepending ours.
        config.resolve ??= {}
        const existingAlias = config.resolve.alias
        const existingAliasArray: Alias[] = Array.isArray(existingAlias)
          ? (existingAlias as Alias[])
          : existingAlias != null
            ? Object.entries(existingAlias).map(([find, replacement]) => ({ find, replacement: replacement as string }))
            : []
        config.resolve.alias = [reactDomServerLegacyAlias, ...existingAliasArray]
      },
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
          ? (existingExternal)
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
    injectSeoRuntime({ entries }),
    injectClientManifestIntoWorker({ clientManifestPath }),
  ]
}

// Injects the client-side SEO head-sync runtime into the browser entry so
// backend `ctx.seo()` metadata stays in sync across Inertia navigations with
// zero app wiring. The runtime is a side-effect import (`@stratal/inertia/seo-runtime`)
// prepended to each configured client entry; it only reaches the browser bundle
// because the worker/SSR builds never transform these entry files.
function injectSeoRuntime(args: { entries: string[] }): Plugin {
  const runtime = '@stratal/inertia/seo-runtime'
  const targets = args.entries.map((entry) => entry.replace(/^\//, ''))

  return {
    name: 'stratal:inertia-inject-seo-runtime',
    transform(code, id) {
      const file = id.split('?')[0]
      if (!targets.some((target) => file.endsWith(target))) return null
      if (code.includes(runtime)) return null
      return { code: `import '${runtime}';\n${code}`, map: null }
    },
  }
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

// Build-time half of the SSR page-exclusion feature (runtime half lives in
// `services/ssr-exclusion.ts`). Two coordinated effects, both keyed off the same
// `ssrExclude` glob list so there is a single source of truth:
//
//  1. `transform` rewrites the worker/SSR `import.meta.glob('./pages/**\/*.tsx')`
//     to add an `ignore`, so excluded page modules (and their heavy deps) never
//     enter the worker bundle — the cold-start win. The browser environment is
//     left untouched so excluded pages still hydrate client-side.
//  2. `config` defines the runtime global with the same glob list, so
//     `InertiaService` renders matching components client-only. `define` (rather
//     than a `generateBundle` injection) makes it present in dev as well as build.
function excludeSsrPages(args: { patterns: string[] }): Plugin {
  // Vite excludes glob matches via negative patterns in the array-form first
  // argument (there is no `ignore` option), so each exclusion becomes a `!`
  // entry appended to the page glob.
  const negativeGlobs = args.patterns.map(toSsrNegativeGlob).map((g) => JSON.stringify(g)).join(', ')
  // Mirrors `SSR_EXCLUDE_GLOBAL` in `services/ssr-exclusion.ts`. Kept as a literal
  // here to honour the Vite-entry boundary (no imports from worker-runtime code).
  const runtimeGlobal = 'globalThis.__STRATAL_INERTIA_SSR_EXCLUDE__'

  return {
    name: 'stratal:inertia-ssr-exclude',
    enforce: 'pre',
    config(config) {
      config.define = {
        ...config.define,
        [runtimeGlobal]: JSON.stringify(args.patterns),
      }
    },
    transform(code, _id) {
      if (this.environment.name === 'client') return null
      if (!code.includes('import.meta.glob')) return null

      const next = code.replace(
        // The optional trailing group preserves a second `import.meta.glob`
        // argument (e.g. `{ eager: true }`) so option-bearing resolvers are
        // rewritten rather than silently skipped.
        /import\.meta\.glob\(\s*(['"])([^'"]*pages[^'"]*)\1\s*(,[^)]*)?\)/g,
        (_match, quote: string, arg: string, rest = '') =>
          `import.meta.glob([${quote}${arg}${quote}, ${negativeGlobs}]${rest})`,
      )

      return next === code ? null : { code: next, map: null }
    },
  }
}

// Convert a component-name glob (`Admin/**`, `Reports/Heavy`) into a negative
// `import.meta.glob` pattern relative to the `./pages` resolver root. A trailing
// `**` already spans the file segment; everything else targets a single `.tsx`
// file (or a single-segment `*` wildcard over `.tsx` files).
function toSsrNegativeGlob(pattern: string): string {
  return pattern.endsWith('**') ? `!./pages/${pattern}` : `!./pages/${pattern}.tsx`
}

