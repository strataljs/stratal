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

  // Hono, stratal, and the React ecosystem must NOT be pre-bundled by Vite's
  // optimizeDeps. When they are, a duplicate copy ends up in `.vite/deps_<env>/`
  // while the worker bundle imports another copy from node_modules — Response
  // objects from one instance flow into a Context class from the other, and
  // Hono's `set res` setter crashes inside `this.#res.headers.entries()` because
  // the prototype chain doesn't match.
  //
  // The same identity-mismatch failure mode hits React: when the optimizer
  // re-runs mid-session (e.g. on a new dep like `@tiptap/core`), already-loaded
  // SSR modules keep references to the old `?v=<hash>` while `react-dom/server`
  // re-resolves to a new hash. Two Reacts coexist, only one has a dispatcher,
  // and `React.use` reads `null` → "Invalid hook call" / "Cannot read
  // properties of null (reading 'use')" inside SSR.
  const optimizeDepsExclude = [
    '@cloudflare/vite-plugin',
    'wrangler',
    'blake3-wasm',
    '@stratal/inertia',
    'stratal',
    'hono',
    '@hono/zod-openapi',
    '@hono/swagger-ui',
    'react',
    'react-dom',
    'react-dom/server',
    'react-dom/server.edge',
    'react-dom/server.browser',
    'react-dom/client',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    'react-is',
    'scheduler',
    'use-sync-external-store',
    'use-sync-external-store/shim',
    'use-sync-external-store/with-selector',
    '@inertiajs/core',
    '@inertiajs/react',
  ]
  const dedupe = [
    'react',
    'react-dom',
    'react-is',
    'scheduler',
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
        env.resolve = {
          ...env.resolve,
          dedupe: [...existingDedupe, ...dedupe],
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
