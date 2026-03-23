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

  const optimizeDepsExclude = ['@cloudflare/vite-plugin', 'wrangler', 'blake3-wasm']

  const baseConfig: UserConfig = {
    plugins: [
      cloudflare(),
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
