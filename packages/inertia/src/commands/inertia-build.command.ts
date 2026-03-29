import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Command } from 'stratal/quarry'
import { writeTempViteConfig } from '../vite/create-vite-config'

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

    const configPath = writeTempViteConfig({
      cwd,
      entryPath,
      outDir,
    })

    this.info('Building Inertia.js frontend for production...')

    const clientCode = await this.spawnVite(cwd, configPath, ['build', '--outDir', outDir])
    if (clientCode !== 0) {
      this.fail('Client build failed.')
      return clientCode
    }
    this.success('Client build complete!')

    if (shouldBuildSsr) {
      this.info('Building SSR bundle...')
      const ssrCode = await this.spawnVite(cwd, configPath, ['build', '--outDir', outDir, '--ssr'])
      if (ssrCode !== 0) {
        this.fail('SSR build failed.')
        return ssrCode
      }
      this.success('SSR build complete!')
    }

    this.success(`Output in ${outDir}/`)
    return 0
  }

  private spawnVite(cwd: string, configPath: string, args: string[]): Promise<number> {
    return new Promise((resolve) => {
      const child = spawn('npx', ['vite', '--config', configPath, ...args], {
        cwd,
        stdio: 'inherit',
        shell: true,
      })

      child.on('error', (err) => {
        this.fail(`Vite process error: ${err.message}`)
        resolve(1)
      })

      child.on('close', (code) => {
        resolve(code ?? 0)
      })
    })
  }
}
