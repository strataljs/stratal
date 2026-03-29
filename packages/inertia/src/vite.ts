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

  const optimizeDepsExclude = ['@cloudflare/vite-plugin', 'wrangler', 'blake3-wasm', '@stratal/inertia']
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
