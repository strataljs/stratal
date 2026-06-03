import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Command } from 'stratal/quarry'
import { writeTempViteConfig } from '../vite/create-vite-config'

export class InertiaDevCommand extends Command {
  static command = 'inertia:dev {--port= : Dev server port} {--host : Expose to network} {--inspector-port= : Worker debugger inspector port (number, or "false" to disable). Set a distinct value per worker to avoid EADDRINUSE when running multiple Inertia workers concurrently.} {--persist-to= : Shared persist directory for @cloudflare/vite-plugin (relative to cwd; the plugin appends /v3). Use to share R2/KV/cache emulator state across multiple workers in dev.}'
  static description = 'Start Inertia.js Vite development server'

  async handle(): Promise<number | undefined> {
    const port = this.number('port')
    const host = this.boolean('host')
    const persistTo = this.string('persist-to')
    const inspectorPortRaw = this.string('inspector-port')
    const inspectorPort =
      inspectorPortRaw === undefined
        ? undefined
        : inspectorPortRaw === 'false'
          ? (false as const)
          : Number(inspectorPortRaw)
    const cwd = process.cwd()

    const entryPath = 'src/inertia/app.tsx'
    if (!existsSync(join(cwd, entryPath))) {
      this.fail('src/inertia/app.tsx not found. Run `quarry inertia:install` first.')
      return 1
    }

    const configPath = writeTempViteConfig({
      cwd,
      server: { port, host },
      persistTo,
      inspectorPort,
    })

    this.info('Starting Vite dev server...')

    const args = ['vite', 'dev', '--config', configPath]
    if (host) args.push('--host')

    return new Promise<number>((resolve) => {
      const child = spawn('npx', args, {
        cwd,
        stdio: 'inherit',
        shell: true,
      })

      child.on('error', (err) => {
        this.fail(`Failed to start dev server: ${err.message}`)
        resolve(1)
      })

      child.on('close', (code) => {
        resolve(code ?? 0)
      })
    })
  }
}
