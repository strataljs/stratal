import type { EnvironmentOptions, Plugin } from 'vite';
import { stratalInertiaDevCss } from './vite/inertia-dev-css-plugin';
import { stratalInertiaTypes } from './vite/inertia-types-plugin';

export { stratalInertiaDevCss, stratalInertiaTypes };

export interface StratalInertiaPluginOptions {
  /** Client entry path(s) for CSS collection (default: ['/src/inertia/app.tsx']) */
  entries?: string[]
}

export function stratalInertia(options?: StratalInertiaPluginOptions): Plugin[] {
  const entries = options?.entries ?? ['/src/inertia/app.tsx']

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
  const devOnlyExternals = ['ts-morph']

  return [
    stratalInertiaDevCss({ entries }),
    stratalInertiaTypes(),
    {
      name: 'stratal:optimize-deps-fix',
      configEnvironment(_name: string, env: EnvironmentOptions) {
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

        const existingExternal = (env.build?.rolldownOptions?.external as string[]) ?? []
        env.build = {
          ...env.build,
          rolldownOptions: {
            ...env.build?.rolldownOptions,
            external: [...existingExternal, ...devOnlyExternals],
          },
        }
      },
    },
    invokeReflectMetadataBeforeTsyringeCheck(),
  ]
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
