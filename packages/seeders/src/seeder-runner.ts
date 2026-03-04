import 'reflect-metadata'

import { Application, type Constructor, type StratalEnv } from 'stratal'
import { LogLevel } from 'stratal/logger'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { collectSeeders } from './collector.js'
import { resolveConfig } from './config.js'
import { executeSeeder } from './executor.js'
import { logger } from './logger.js'
import type { Seeder } from './seeder.js'
import type { SeederMap } from './types.js'

export class SeederRunner {
  static run(module: Constructor): void {
    main(module).catch((error: unknown) => {
      logger.error('Fatal error:', error instanceof Error ? error.message : String(error))
      process.exit(1)
    })
  }
}

async function main(module: Constructor): Promise<void> {
  const seeders = collectSeeders(module)

  await yargs(hideBin(process.argv))
    .scriptName('stratal-seed')
    .usage('Usage: $0 <command> [options]')

    .command(
      'run <seeder>',
      'Run a seeder',
      (yargs) => {
        return yargs
          .positional('seeder', {
            describe: 'Seeder name (or --all to run all)',
            type: 'string',
          })
          .option('all', {
            alias: 'a',
            type: 'boolean',
            description: 'Run all seeders',
            default: false,
          })
          .option('dry-run', {
            alias: 'd',
            type: 'boolean',
            description: 'Preview without executing',
            default: false,
          })
      },
      async (argv) => {
        const config = resolveConfig()
        const dryRun = argv.dryRun

        if (argv.all) {
          await runAllSeeders(module, config.wranglerPath, seeders, dryRun)
          return
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const seederName = argv.seeder!

        if (!(seederName in seeders)) {
          logger.error(`Seeder "${seederName}" not found`)
          printAvailableSeeders(seeders)
          process.exit(1)
        }

        await runSingleSeeder(module, config.wranglerPath, seeders[seederName], dryRun)
      }
    )

    .command(
      'list',
      'List available seeders',
      {},
      () => {
        printAvailableSeeders(seeders)
      }
    )

    .demandCommand(1, 'You must specify a command')
    .help()
    .alias('help', 'h')
    .parse()
}

async function runSingleSeeder(
  module: Constructor,
  wranglerPath: string,
  SeederClass: Constructor<Seeder>,
  dryRun: boolean
): Promise<void> {
  const { app, dispose } = await loadApp(module, wranglerPath)
  try {
    await executeSeeder(app, SeederClass, dryRun)
  } finally {
    await app.shutdown()
    await dispose()
  }
}

async function runAllSeeders(
  module: Constructor,
  wranglerPath: string,
  seeders: SeederMap,
  dryRun: boolean
): Promise<void> {
  const seederNames = Object.keys(seeders)
  if (seederNames.length === 0) {
    logger.warn('No seeders found')
    return
  }

  logger.section(`Running all seeders (${seederNames.length})`)

  const { app, dispose } = await loadApp(module, wranglerPath)
  try {
    for (const name of seederNames) {
      await executeSeeder(app, seeders[name], dryRun)
    }
  } finally {
    await app.shutdown()
    await dispose()
  }
}

async function loadApp(
  module: Constructor,
  wranglerPath: string
): Promise<{ app: Application; dispose: () => Promise<void> }> {
  const { getPlatformProxy } = await import('wrangler')

  const { env, ctx, dispose } = await getPlatformProxy({
    configPath: wranglerPath,
  })

  const app = new Application(env as unknown as StratalEnv, ctx, {
    module,
    logging: {
      level: LogLevel.ERROR,
      formatter: 'pretty'
    }
  })
  await app.initialize()

  return { app, dispose }
}

function printAvailableSeeders(seeders: SeederMap): void {
  const names = Object.keys(seeders)

  logger.plain('\nAvailable seeders:')
  if (names.length === 0) {
    logger.plain('  (none)')
  } else {
    for (const name of names) {
      logger.plain(`  - ${name}`)
    }
  }
  logger.plain('')
}
