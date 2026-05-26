import { existsSync } from 'node:fs'
import { createRequire, register } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { URL, pathToFileURL } from 'node:url'
import type { MiniflareOptions } from 'miniflare'
import type { QuarryRegistry } from 'stratal/quarry'
import { type Application } from '../application'
import { extractEnvFlag } from './argv'
import { createDynamicCommands } from './commands/dynamic-command'

interface WranglerConfig {
  name?: string
  vars?: Record<string, unknown>
}

interface MiniflareWorkerResult {
  workerOptions: Record<string, unknown>
}

interface WranglerModule {
  unstable_readConfig: (args: { config?: string; env?: string }) => WranglerConfig
  unstable_getMiniflareWorkerOptions: (config: WranglerConfig, env?: string) => MiniflareWorkerResult
  unstable_getVarsForDev: (configPath: string | undefined, envFiles: undefined, vars: unknown, env: string | undefined) => Record<string, { value: string }>
}

interface MiniflareModule {
  Miniflare: new (opts: MiniflareOptions) => { ready: Promise<URL>; getBindings: (name?: string) => Promise<Record<string, unknown>>; dispose: () => Promise<void> }
  getDefaultDevRegistryPath: () => string
}

const require = createRequire(import.meta.url)

// Register @swc-node/register for TypeScript + decorator support
const swcRegisterPath = join(dirname(require.resolve('@swc-node/register')), 'esm/esm.mjs')
register(pathToFileURL(swcRegisterPath), pathToFileURL('./'))

// Register cloudflare:workers virtual module loader
register(new URL('./cloudflare-workers-loader.mjs', import.meta.url), pathToFileURL('./'))

const DEFAULT_ENTRY = './src/quarry.ts'

let environment: string | undefined
try {
  const parsed = extractEnvFlag(process.argv.slice(2))
  environment = parsed.env
  process.argv.splice(2, process.argv.length - 2, ...parsed.rest)
} catch (e) {
  console.error(`Error: ${(e as Error).message}`)
  process.exit(1)
}

// Determine entry file: if first arg looks like a file path, use it; otherwise use default
const firstArg = process.argv[2]
let entryFile = DEFAULT_ENTRY

if (firstArg && (firstArg.includes('/') || firstArg.includes('\\') || /\.(ts|js|mts|mjs)$/.test(firstArg))) {
  entryFile = firstArg
  // Remove the entry file from argv so Clipanion sees: [node, script, command, ...options]
  process.argv.splice(2, 1)
}

// Resolve and validate the entry file
const entryPath = resolve(process.cwd(), entryFile)

if (!existsSync(entryPath)) {
  console.error(`Error: Entry file not found: ${entryFile}`)
  console.error('')
  console.error('Create src/quarry.ts that exports `QuarryRunner.run({ module, seeders })`, or specify a custom path:')
  console.error('  npx quarry ./path/to/entry.ts <command> [options]')
  process.exit(1)
}

async function main(): Promise<void> {
  const cwdRequire = createRequire(join(process.cwd(), 'package.json'))

  const { unstable_readConfig: readConfig, unstable_getMiniflareWorkerOptions: getMiniflareWorkerOptions, unstable_getVarsForDev: getVarsForDev } = await import(cwdRequire.resolve('wrangler')) as WranglerModule
  const { Miniflare, getDefaultDevRegistryPath } = await import(cwdRequire.resolve('miniflare')) as MiniflareModule

  const candidates = ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml']
  const configName = candidates.find(c => existsSync(resolve(process.cwd(), c)))
  const configPath = configName ? resolve(process.cwd(), configName) : undefined

  const config = readConfig({ config: configPath, env: environment })
  const { workerOptions } = getMiniflareWorkerOptions(config, environment)

  const vars = getVarsForDev(configPath, undefined, config.vars, environment)
  const varsRecord: Record<string, string> = {}
  for (const [key, binding] of Object.entries(vars)) {
    varsRecord[key] = binding.value
  }

  const existingBindings = workerOptions.bindings as Record<string, unknown> ?? {}
  workerOptions.bindings = {
    ...existingBindings,
    ...varsRecord,
    QUEUE_PROVIDER: 'sync',
  }

  // Rename so quarry doesn't overwrite a running `wrangler dev` session's
  // dev-registry entry. The registry is how Miniflare discovers peer workers
  // for service binding resolution — a collision would break the running session.
  const workerName = config.name ? `quarry-${config.name}-${process.pid}` : `quarry-${process.pid}`
  workerOptions.name = workerName

  // Resolve the dev-registry path so Miniflare can discover running
  // `wrangler dev` sessions for service binding resolution.
  const registryPath = getDefaultDevRegistryPath()

  const mf = new Miniflare({
    ...workerOptions,
    script: '',
    modules: true,
    unsafeDevRegistryPath: registryPath,
  })

  await mf.ready
  const env = await mf.getBindings()

  const pendingPromises: Promise<unknown>[] = []
  const trackedWaitUntil = (promise: Promise<unknown>) => {
    pendingPromises.push(promise)
  }

  let app: Application | undefined
  try {
    (globalThis as Record<string, unknown>).__stratalPlatformProxy = {
      env,
      waitUntil: trackedWaitUntil,
    }

    await import(pathToFileURL(entryPath).href)

    const [
      { Stratal },
      { DI_TOKENS },
      { parseSignature },
    ] = await Promise.all([
      import('stratal'),
      import('stratal/di'),
      import('stratal/quarry'),
    ])

    app = await Stratal.resolveApplication()
    const quarry = app.container.resolve<QuarryRegistry>(DI_TOKENS.Quarry)

    const { Cli } = await import('clipanion')
    const pkg = require('../../package.json') as { version: string }

    const cli = new Cli({
      binaryName: 'quarry',
      binaryLabel: 'Quarry CLI',
      binaryVersion: pkg.version,
    })

    for (const cmd of createDynamicCommands(quarry, parseSignature, app)) {
      cli.register(cmd)
    }

    await cli.runExit(process.argv.slice(2), { ...Cli.defaultContext })
  } finally {
    await Promise.allSettled(pendingPromises)
    await app?.shutdown()
    await mf.dispose()
  }
}

main().catch(async (error: unknown) => {
  const { ConfigValidationError } = await import('stratal/config')

  const message = error instanceof Error ? error.message : String(error)
  console.error('Fatal error:', message)
  if (error instanceof ConfigValidationError) {
    console.error(error.errors.message)
  }
  process.exit(1)
})
