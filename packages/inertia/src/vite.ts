import type { EnvironmentOptions, Plugin } from 'vite'
import { stratalInertiaDevCss } from './vite/inertia-dev-css-plugin'
import { stratalInertiaTypes } from './vite/inertia-types-plugin'

export { stratalInertiaDevCss, stratalInertiaTypes }

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
  ]
}
