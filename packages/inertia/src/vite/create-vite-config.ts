import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { EnvironmentOptions, Plugin, UserConfig } from 'vite'

export interface InertiaViteConfigOptions {
  cwd: string
  entryPath: string
  outDir?: string
  server?: { port?: number; host?: boolean }
}

export async function createInertiaViteConfig(options: InertiaViteConfigOptions): Promise<UserConfig> {
  const { mergeConfig } = await import('vite')

  let userConfig = {}
  const viteConfigPath = join(options.cwd, 'vite.config.ts')
  if (existsSync(viteConfigPath)) {
    const loaded = await import(/* @vite-ignore */ viteConfigPath) as Record<string, unknown>
    userConfig = loaded.default ?? loaded
  }

  const { cloudflare } = await import('@cloudflare/vite-plugin') as unknown as { cloudflare: () => Plugin }

  const { stratalInertiaDevCss } = await import('./inertia-dev-css-plugin')
  const { stratalInertiaTypes } = await import('./inertia-types-plugin')

  // Check if user's config already includes the @inertiajs/vite plugin
  const userPlugins = Array.isArray((userConfig as UserConfig).plugins)
    ? (userConfig as UserConfig).plugins!.flat()
    : []
  const hasInertiaPlugin = userPlugins.some(
    (p) => p && typeof p === 'object' && 'name' in p && (p as Plugin).name === 'inertia',
  )

  const inertiaPlugins: Plugin[] = []
  if (!hasInertiaPlugin) {
    try {
      const { default: inertia } = await import('@inertiajs/vite') as { default: (opts?: Record<string, unknown>) => Plugin }
      inertiaPlugins.push(inertia({
        pages: { path: './src/inertia/pages', extension: '.tsx' },
      }))
    } catch {
      // @inertiajs/vite not installed — skip
    }
  }

  const optimizeDepsExclude = ['@cloudflare/vite-plugin', 'wrangler', 'blake3-wasm']

  const baseConfig: UserConfig = {
    plugins: [
      cloudflare(),
      ...inertiaPlugins,
      stratalInertiaDevCss({ entries: ['/' + options.entryPath] }),
      stratalInertiaTypes(),
      {
        name: 'stratal:optimize-deps-fix',
        configEnvironment(_name: string, env: EnvironmentOptions) {
          const existing = env.optimizeDeps?.exclude ?? []
          env.optimizeDeps = {
            ...env.optimizeDeps,
            exclude: [...existing, ...optimizeDepsExclude],
          }
        },
      },
    ],
    publicDir: join(options.cwd, 'src', 'inertia', 'public'),
    build: {
      ...(options.outDir ? { outDir: options.outDir } : {}),
      rolldownOptions: {
        input: options.entryPath,
      },
    },
    ...(options.server ? {
      server: {
        port: options.server.port,
        host: options.server.host ?? undefined,
      },
    } : {}),
  }

  return mergeConfig(baseConfig, userConfig)
}
