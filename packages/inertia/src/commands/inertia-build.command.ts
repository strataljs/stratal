import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Command } from 'stratal/quarry'
import { writeTempClientViteConfig } from '../vite/create-client-vite-config'
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

    // Phase 1: standalone browser-bundle build. Runs without the Cloudflare
    // vite-plugin so it isn't subject to its parallel env orchestration. The
    // resulting `<clientOutDir>/.vite/manifest.json` is what the worker build
    // (phase 2) inlines into the worker entry via `stratal:inertia-inject-manifest`.
    const clientOutDir = join(outDir, 'client').replace(/\\/g, '/')
    const clientConfigPath = writeTempClientViteConfig({
      cwd,
      entry: entryPath,
      outDir: clientOutDir,
    })

    this.info('Building Inertia.js browser bundle...')
    const browserCode = await this.spawnVite(cwd, clientConfigPath, ['build'])
    if (browserCode !== 0) {
      this.fail('Browser bundle build failed.')
      return browserCode
    }
    this.success(`Browser bundle written to ${clientOutDir}/`)

    // Phase 2: worker build (Cloudflare vite-plugin). The injector plugin
    // reads the manifest produced in phase 1 and inlines it onto the worker
    // entry chunk.
    const configPath = writeTempViteConfig({
      cwd,
      outDir,
      clientManifestPath: join(clientOutDir, '.vite', 'manifest.json').replace(/\\/g, '/'),
    })

    this.info('Building Cloudflare worker bundle...')
    const workerCode = await this.spawnVite(cwd, configPath, ['build'])
    if (workerCode !== 0) {
      this.fail('Worker build failed.')
      return workerCode
    }
    this.success('Worker build complete!')

    if (shouldBuildSsr) {
      this.info('Building SSR bundle...')
      const ssrCode = await this.spawnVite(cwd, configPath, ['build', '--ssr'])
      if (ssrCode !== 0) {
        this.fail('SSR build failed.')
        return ssrCode
      }
      this.success('SSR build complete!')
    }

    this.success(`Output in ${outDir}/`)
    this.info('Deploy with: npx wrangler deploy')
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
