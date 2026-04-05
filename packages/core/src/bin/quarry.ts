import 'reflect-metadata'

import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { createRequire, register } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { URL, pathToFileURL } from 'node:url'
import type { QuarryRegistry } from 'stratal/quarry'
import { type Application } from '../application'
import { errors as errorMessages } from '../i18n/messages/en/errors'
import { createDynamicCommands } from './commands/dynamic-command'

const require = createRequire(import.meta.url)

// Register @swc-node/register for TypeScript + decorator support
const swcRegisterPath = join(dirname(require.resolve('@swc-node/register')), 'esm/esm.mjs')
register(pathToFileURL(swcRegisterPath), pathToFileURL('./'))

// Register cloudflare:workers virtual module loader
register(new URL('./cloudflare-workers-loader.mjs', import.meta.url), pathToFileURL('./'))

const DEFAULT_ENTRY = './src/index.ts'

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
  console.error('Create src/index.ts with a default Stratal export, or specify a custom path:')
  console.error('  npx quarry ./path/to/entry.ts <command> [options]')
  process.exit(1)
}

function stripDurableObjects(config: Record<string, unknown>): void {
  delete config.durable_objects
  delete config.migrations
  if (config.env && typeof config.env === 'object') {
    for (const envConfig of Object.values(config.env as Record<string, Record<string, unknown>>)) {
      delete envConfig.durable_objects
      delete envConfig.migrations
    }
  }
}

async function createStrippedConfig(cwdRequire: NodeRequire): Promise<string | undefined> {
  const candidates = ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml']
  const configName = candidates.find(c => existsSync(resolve(process.cwd(), c)))
  if (!configName) return undefined

  const configPath = resolve(process.cwd(), configName)
  const raw = readFileSync(configPath, 'utf-8')

  let config: Record<string, unknown>
  if (configName.endsWith('.toml')) {
    const { parse } = await import(cwdRequire.resolve('smol-toml')) as { parse: (input: string) => Record<string, unknown> }
    config = parse(raw)
  } else {
    const { parse: parseJsonc } = await import(cwdRequire.resolve('jsonc-parser')) as { parse: (input: string) => Record<string, unknown> }
    config = parseJsonc(raw)
  }

  stripDurableObjects(config)

  const tmpPath = resolve(tmpdir(), `quarry-wrangler-${Date.now()}.json`)
  writeFileSync(tmpPath, JSON.stringify(config, null, 2))
  return tmpPath
}

function discoverEnvFiles(): string[] {
  const cwd = process.cwd()
  const files = readdirSync(cwd)
  return files
    .filter(file => (/^\.dev\.vars($|\.)/.test(file) || /^\.env($|\.)/.test(file)) && !file.endsWith('.example') && !file.endsWith('.sample'))
    .sort((a, b) => {
      // Load .env files before .dev.vars so .dev.vars takes precedence
      const aIsDevVars = a.startsWith('.dev.vars')
      const bIsDevVars = b.startsWith('.dev.vars')
      if (aIsDevVars !== bIsDevVars) return aIsDevVars ? 1 : -1
      // Within each group, .local files load last (highest precedence)
      const aIsLocal = a.endsWith('.local')
      const bIsLocal = b.endsWith('.local')
      if (aIsLocal !== bIsLocal) return aIsLocal ? 1 : -1
      return a.localeCompare(b)
    })
    .map(file => join(cwd, file))
}

async function main(): Promise<void> {
  const cwdRequire = createRequire(join(process.cwd(), 'package.json'))
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const { getPlatformProxy } = await import(cwdRequire.resolve('wrangler')) as typeof import('wrangler')

  const tmpConfigPath = await createStrippedConfig(cwdRequire)

  const envFiles = discoverEnvFiles()
  const { env, ctx, dispose } = await getPlatformProxy({
    envFiles, configPath: tmpConfigPath,
  })

  // Track waitUntil promises so we can drain them before shutdown.
  // In Workers runtime, waitUntil keeps the isolate alive. In Quarry (miniflare),
  // dispose() tears down without awaiting pending promises — so we track and drain them.
  const pendingPromises: Promise<unknown>[] = []
  const trackedWaitUntil = (promise: Promise<unknown>) => {
    pendingPromises.push(promise)
    ctx.waitUntil(promise)
  }

  let app: Application | undefined
  try {
    env.QUEUE_PROVIDER = 'sync';

    // Store platform proxy on globalThis so the cloudflare:workers virtual module can read it
    (globalThis as Record<string, unknown>).__stratalPlatformProxy = {
      env,
      waitUntil: trackedWaitUntil,
    }

    // Import user's entry file — triggers `new Stratal(...)` + full Application init
    await import(pathToFileURL(entryPath).href)

    // Parallel import of stratal modules
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

    // Build Clipanion CLI
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
    await Promise.allSettled(pendingPromises);

    await app?.shutdown()
    await dispose()
    if (tmpConfigPath) {
      try { unlinkSync(tmpConfigPath) } catch {
        //
      }
    }
  }
}

main().catch(async (error: unknown) => {
  const { ConfigValidationError } = await import('stratal/config')
  const { StratalNotInitializedError } = await import('stratal/errors')

  const message = error instanceof StratalNotInitializedError
    ? errorMessages.stratalNotInitialized
    : error instanceof Error ? error.message : String(error)
  console.error('Fatal error:', message)
  if (error instanceof ConfigValidationError) {
    console.error(error.errors.message)
  }
  process.exit(1)
})
