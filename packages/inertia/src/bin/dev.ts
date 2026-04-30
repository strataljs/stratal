import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { writeTempViteConfig } from '../vite/create-vite-config'
import { logger } from './logger'

export async function runDev(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      port: { type: 'string' },
      host: { type: 'boolean' },
      'persist-to': { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  })

  const port = values.port ? Number(values.port) : undefined
  const host = values.host === true
  const persistTo = values['persist-to']
  const cwd = process.cwd()

  const entryPath = 'src/inertia/app.tsx'
  if (!existsSync(join(cwd, entryPath))) {
    logger.fail('src/inertia/app.tsx not found. Run `npx inertia install` first.')
    return 1
  }

  const configPath = writeTempViteConfig({
    cwd,
    server: { port, host },
    persistTo,
  })

  logger.info('Starting Vite dev server...')

  const args = ['vite', 'dev', '--config', configPath]
  if (host) args.push('--host')

  return new Promise<number>((resolve) => {
    const child = spawn('npx', args, {
      cwd,
      stdio: 'inherit',
      shell: true,
    })

    child.on('error', (err) => {
      logger.fail(`Failed to start dev server: ${err.message}`)
      resolve(1)
    })

    child.on('close', (code) => {
      resolve(code ?? 0)
    })
  })
}
