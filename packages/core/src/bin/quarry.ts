import 'reflect-metadata';

import { existsSync } from 'node:fs';
import { createRequire, register } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { QuarryRegistry } from 'stratal/quarry';
import type Wrangler from 'wrangler';

import { createDynamicCommands } from './commands/dynamic-command';
import { createHelpCommand } from './commands/help-command';
import { createListCommand } from './commands/list-command';

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

async function main(): Promise<void> {
  const cwdRequire = createRequire(join(process.cwd(), 'package.json'))
  const { getPlatformProxy } = await import(cwdRequire.resolve('wrangler')) as typeof Wrangler
  const { env, ctx, dispose } = await getPlatformProxy();

  // Store platform proxy on globalThis so the cloudflare:workers virtual module can read it
  (globalThis as Record<string, unknown>).__stratalPlatformProxy = {
    env,
    waitUntil: ctx.waitUntil.bind(ctx),
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

  const app = await Stratal.resolveApplication()
  const quarry = app.container.resolve<QuarryRegistry>(DI_TOKENS.Quarry)

  // Build Clipanion CLI
  const { Builtins, Cli } = await import('clipanion')
  const pkg = require('../../package.json') as { version: string }

  const cli = new Cli({
    binaryName: 'quarry',
    binaryLabel: 'Quarry CLI',
    binaryVersion: pkg.version,
  })

  cli.register(Builtins.HelpCommand)
  cli.register(createListCommand(quarry))
  cli.register(createHelpCommand(quarry))

  for (const cmd of createDynamicCommands(quarry, parseSignature, app)) {
    cli.register(cmd)
  }

  try {
    await cli.runExit(process.argv.slice(2), { ...Cli.defaultContext })
  } finally {
    await app.shutdown()
    await dispose()
  }
}

main().catch((error: unknown) => {
  console.error('Fatal error:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
