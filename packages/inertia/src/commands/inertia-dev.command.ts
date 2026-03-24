import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Command } from 'stratal/quarry'
import { createInertiaViteConfig } from '../vite/create-vite-config'

export class InertiaDevCommand extends Command {
  static command = 'inertia:dev {--port=5173 : Dev server port} {--host : Expose to network}'
  static description = 'Start Inertia.js Vite development server'

  async handle(): Promise<number | undefined> {
    const port = this.number('port') || 5173
    const host = this.boolean('host')
    const cwd = process.cwd()

    const entryPath = 'src/inertia/app.tsx'
    if (!existsSync(join(cwd, entryPath))) {
      this.fail('src/inertia/app.tsx not found. Run `quarry inertia:install` first.')
      return 1
    }

    this.info('Starting Vite dev server...')

    try {
      const { createServer } = await import('vite')

      const config = await createInertiaViteConfig({
        cwd,
        entryPath,
        server: { port, host },
      })

      const server = await createServer(config)
      await server.listen()
      server.printUrls()
    } catch (err) {
      this.fail(`Failed to start dev server: ${(err as Error).message}`)
      return 1
    }

    return 0
  }
}
