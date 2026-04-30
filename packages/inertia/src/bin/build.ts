import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { writeTempViteConfig } from '../vite/create-vite-config'
import { logger } from './logger'

export async function runBuild(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      'out-dir': { type: 'string', default: 'dist' },
      ssr: { type: 'boolean' },
    },
    strict: true,
    allowPositionals: false,
  })

  const outDir = values['out-dir'] || 'dist'
  const shouldBuildSsr = values.ssr === true
  const cwd = process.cwd()

  const entryPath = 'src/inertia/app.tsx'
  if (!existsSync(join(cwd, entryPath))) {
    logger.fail('src/inertia/app.tsx not found. Run `npx inertia install` first.')
    return 1
  }

  const configPath = writeTempViteConfig({ cwd, outDir })

  logger.info('Building Inertia.js frontend for production...')

  const clientCode = await spawnVite(cwd, configPath, ['build'])
  if (clientCode !== 0) {
    logger.fail('Client build failed.')
    return clientCode
  }
  logger.success('Client build complete!')

  if (shouldBuildSsr) {
    logger.info('Building SSR bundle...')
    const ssrCode = await spawnVite(cwd, configPath, ['build', '--ssr'])
    if (ssrCode !== 0) {
      logger.fail('SSR build failed.')
      return ssrCode
    }
    logger.success('SSR build complete!')
  }

  logger.success(`Output in ${outDir}/`)
  logger.info('Deploy with: npx wrangler deploy')
  return 0
}

function spawnVite(cwd: string, configPath: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['vite', '--config', configPath, ...args], {
      cwd,
      stdio: 'inherit',
      shell: true,
    })

    child.on('error', (err) => {
      logger.fail(`Vite process error: ${err.message}`)
      resolve(1)
    })

    child.on('close', (code) => {
      resolve(code ?? 0)
    })
  })
}
