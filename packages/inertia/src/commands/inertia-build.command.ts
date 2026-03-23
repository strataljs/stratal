import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Command } from 'stratal/quarry'
import { type Plugin } from 'vite'

export class InertiaBuildCommand extends Command {
  static command = 'inertia:build {--outDir=dist : Output directory}'
  static description = 'Build Inertia.js frontend for production'

  async handle(): Promise<number | undefined> {
    const outDir = this.string('outDir') || 'dist'
    const cwd = process.cwd()

    const entryPath = join(cwd, 'src', 'inertia', 'app.tsx')
    if (!existsSync(entryPath)) {
      this.fail('src/inertia/app.tsx not found. Run `quarry inertia:install` first.')
      return 1
    }

    this.info('Building Inertia.js frontend for production...')

    try {
      const { build, mergeConfig } = await import('vite')

      let userConfig = {}
      const viteConfigPath = join(cwd, 'vite.config.ts')
      if (existsSync(viteConfigPath)) {
        const loaded = await import(/* @vite-ignore */ viteConfigPath) as Record<string, unknown>
        userConfig = loaded.default ?? loaded
        this.info('Loaded vite.config.ts')
      }

      const { cloudflare } = await import('@cloudflare/vite-plugin') as unknown as { cloudflare: () => Plugin }

      const baseConfig = {
        plugins: [cloudflare()],
        build: {
          outDir,
          rolldownOptions: {
            input: entryPath,
          },
        },
      }

      const finalConfig = mergeConfig(baseConfig, userConfig)
      await build(finalConfig)

      this.success(`Build complete! Output in ${outDir}/`)
    } catch (err) {
      this.fail(`Build failed: ${(err as Error).message}`)
      return 1
    }

    return 0
  }
}
