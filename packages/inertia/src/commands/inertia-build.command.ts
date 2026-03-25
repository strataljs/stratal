import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Command } from 'stratal/quarry'
import { createInertiaViteConfig } from '../vite/create-vite-config'

export class InertiaBuildCommand extends Command {
  static command = 'inertia:build {--outDir=dist : Output directory} {--ssr : Also build SSR bundle}'
  static description = 'Build Inertia.js frontend for production'

  async handle(): Promise<number | undefined> {
    const outDir = this.string('outDir') || 'dist'
    const shouldBuildSsr = this.boolean('ssr')
    const cwd = process.cwd()

    const entryPath = 'src/inertia/app.tsx'
    if (!existsSync(join(cwd, entryPath))) {
      this.fail('src/inertia/app.tsx not found. Run `quarry inertia:install` first.')
      return 1
    }

    this.info('Building Inertia.js frontend for production...')

    try {
      const { build } = await import('vite')

      const config = await createInertiaViteConfig({
        cwd,
        entryPath,
        outDir,
      })

      await build(config)
      this.success('Client build complete!')

      if (shouldBuildSsr) {
        this.info('Building SSR bundle...')
        await build({
          ...config,
          build: {
            ...config.build,
            ssr: true,
          },
        })
        this.success('SSR build complete!')
      }

      this.success(`Output in ${outDir}/`)
    } catch (err) {
      this.fail(`Build failed: ${(err as Error).message}`)
      return 1
    }

    return 0
  }
}
