import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Command } from 'stratal/quarry'
import { type Plugin } from 'vite'

export class InertiaDevCommand extends Command {
  static command = 'inertia:dev {--port=5173 : Dev server port} {--host : Expose to network}'
  static description = 'Start Inertia.js Vite development server'

  async handle(): Promise<number | undefined> {
    const port = this.number('port') || 5173
    const host = this.boolean('host')
    const cwd = process.cwd()

    const entryPath = join(cwd, 'src', 'inertia', 'app.tsx')
    if (!existsSync(entryPath)) {
      this.fail('src/inertia/app.tsx not found. Run `quarry inertia:install` first.')
      return 1
    }

    this.info('Starting Vite dev server...')

    try {
      const { createServer, mergeConfig } = await import('vite')

      // Load user's vite.config if it exists
      let userConfig = {}
      const viteConfigPath = join(cwd, 'vite.config.ts')
      if (existsSync(viteConfigPath)) {
        const loaded = await import(/* @vite-ignore */ viteConfigPath) as Record<string, unknown>
        userConfig = loaded.default ?? loaded
        this.info('Loaded vite.config.ts')
      }

      const { cloudflare } = await import('@cloudflare/vite-plugin') as unknown as { cloudflare: () => Plugin }

      const wranglerExclude = ['@cloudflare/vite-plugin', 'wrangler', 'blake3-wasm']

      const baseConfig = {
        plugins: [
          cloudflare(),
          {
            name: 'stratal:wrangler-optimize-fix',
            configEnvironment(_name: string, env: Record<string, unknown>) {
              const optimizeDeps = (env.optimizeDeps ?? {}) as Record<string, unknown>
              const existing = (optimizeDeps.exclude ?? []) as string[]
              optimizeDeps.exclude = [...existing, ...wranglerExclude]
              env.optimizeDeps = optimizeDeps
            },
          },
        ],
        build: {
          rolldownOptions: {
            input: entryPath,
          },
        },
        server: {
          port,
          host: host || undefined,
        },
      }

      const finalConfig = mergeConfig(baseConfig, userConfig)
      const server = await createServer(finalConfig)
      await server.listen()
      server.printUrls()
    } catch (err) {
      this.fail(`Failed to start dev server: ${(err as Error).message}`)
      return 1
    }

    return 0
  }
}
