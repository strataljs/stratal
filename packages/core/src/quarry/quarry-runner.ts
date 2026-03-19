/**
 * QuarryRunner — Node-only CLI runner for Quarry commands.
 *
 * Dynamically imports Clipanion and Wrangler. Both are optional peerDependencies.
 * This file is NOT edge-compatible — it uses process.argv, process.exit, etc.
 */

import { Cli, Command as CliCommand, Option } from 'clipanion'
import pkg from '../../package.json'
import type { Application, ApplicationConfig } from '../application'
import { type StratalEnv } from '../env'
import type { Constructor } from '../types'
import type { Command } from './command'
import type { QuarryRegistry } from './quarry'
import { parseSignature } from './signature-parser'
import type { CommandResult, ParsedSignature } from './types'

export interface QuarryRunnerOptions {
  /** Path to wrangler config. Defaults to 'wrangler.jsonc' */
  wranglerPath?: string
}

/**
 * CLI entry point for Quarry commands.
 *
 * @example
 * ```typescript
 * import { QuarryRunner } from 'stratal/quarry'
 * import { AppModule } from '../app.module'
 *
 * QuarryRunner.run(AppModule)
 * ```
 */
export class QuarryRunner {
  static run(module: Constructor | ApplicationConfig, options?: QuarryRunnerOptions): void {
    runCli(module, options).catch((error: unknown) => {
      console.error('Fatal error:', error instanceof Error ? error.message : String(error))
      process.exit(1)
    })
  }
}

async function runCli(
  moduleOrConfig: Constructor | ApplicationConfig,
  options?: QuarryRunnerOptions,
): Promise<void> {
  const { getPlatformProxy } = await import('wrangler')
  const { Application } = await import('../application')
  const { DI_TOKENS } = await import('../di/tokens')
  const { LogLevel } = await import('../logger')

  const wranglerPath = options?.wranglerPath ?? 'wrangler.jsonc'
  const { env, ctx, dispose } = await getPlatformProxy({ configPath: wranglerPath })

  const config: ApplicationConfig = typeof moduleOrConfig === 'function'
    ? { module: moduleOrConfig }
    : moduleOrConfig

  const app = new Application({
    ...config,
    logging: config.logging ?? { level: LogLevel.ERROR, formatter: 'pretty' },
    env: env as unknown as StratalEnv,
    ctx,
  })

  try {
    await app.initialize()
  } catch (error) {
    await dispose()
    throw error
  }

  const quarry = app.container.resolve<QuarryRegistry>(DI_TOKENS.Quarry)

  // Build Clipanion CLI
  const cli = new Cli({
    binaryName: 'quarry',
    binaryLabel: 'Quarry CLI',
    binaryVersion: pkg.version,
  })

  // Register "list" built-in command
  cli.register(createListCommand(quarry))

  // Register "help <command>" built-in command
  cli.register(createHelpCommand(quarry))

  // Register dynamic wrapper commands for each Quarry command
  for (const entry of quarry.list()) {
    const commandInstance = quarry.get(entry.name)!
    const commandClass = commandInstance.constructor as unknown as typeof Command
    const signature = parseSignature(commandClass.command)

    cli.register(createDynamicCommand(
      entry.name,
      signature,
      commandClass.description,
      commandClass.aliases,
      quarry,
      app,
    ))
  }

  try {
    await cli.runExit(process.argv.slice(2), { ...Cli.defaultContext })
  } finally {
    await app.shutdown()
    await dispose()
  }
}

function createListCommand(quarry: QuarryRegistry) {
  class ListCommand extends CliCommand {
    static override paths = [['list']]
    static override usage = CliCommand.Usage({ description: 'List all available commands' })

    execute(): Promise<number> {
      const commands = quarry.list()

      if (commands.length === 0) {
        this.context.stdout.write('No commands registered.\n')
        return Promise.resolve(0)
      }

      this.context.stdout.write('\nAvailable commands:\n\n')

      const maxName = Math.max(...commands.map((c) => c.name.length))
      for (const cmd of commands) {
        const aliasStr = cmd.aliases.length > 0 ? ` (${cmd.aliases.join(', ')})` : ''
        const desc = cmd.description ?? ''
        this.context.stdout.write(`  ${cmd.name.padEnd(maxName + 4)}${desc}${aliasStr}\n`)
      }

      this.context.stdout.write('\n')
      return Promise.resolve(0)
    }
  }

  return ListCommand
}

function createHelpCommand(quarry: QuarryRegistry) {
  class HelpCommand extends CliCommand {
    static override paths = [['help']]
    static override usage = CliCommand.Usage({ description: 'Show help for a command' })

    commandName = Option.String()

    async execute(): Promise<number> {
      const usage = await quarry.usage(this.commandName)
      this.context.stdout.write(usage + '\n')
      return 0
    }
  }

  return HelpCommand
}

function createDynamicCommand(
  name: string,
  signature: ParsedSignature,
  description: string | undefined,
  aliases: string[] | undefined,
  quarry: QuarryRegistry,
  app: Application,
) {
  const paths: string[][] = [name.split(' ')]
  if (aliases) {
    for (const alias of aliases) {
      paths.push(alias.split(' '))
    }
  }

  class DynCmd extends CliCommand {
    static override paths = paths
    static override usage = description ? CliCommand.Usage({ description }) : undefined

    async execute(): Promise<number> {
      const input: Record<string, unknown> = {}

      for (const arg of signature.arguments) {
        const value = (this as Record<string, unknown>)[arg.name]
        if (value !== undefined) input[arg.name] = value
      }

      for (const opt of signature.options) {
        const value = (this as Record<string, unknown>)[opt.name]
        if (value !== undefined) input[opt.name] = value
      }

      const mockContext = app.createMockRouterContext('en')
      const result = await app.container.runInRequestScope<CommandResult>(mockContext, async () => {
        return quarry.call(name, input)
      })

      for (const line of result.output) {
        this.context.stdout.write(line + '\n')
      }

      for (const err of result.errors) {
        this.context.stderr.write(err + '\n')
      }

      return result.exitCode
    }
  }

  // Define Clipanion options/arguments as class property defaults
  // Clipanion Option helpers return decorated values that work as property initializers
  const proto = DynCmd.prototype as unknown as Record<string, unknown>
  for (const arg of signature.arguments) {
    if (arg.isArray) {
      proto[arg.name] = Option.Rest({ name: arg.name, required: arg.required ? 1 : 0 })
    } else {
      proto[arg.name] = Option.String({ name: arg.name, required: arg.required })
    }
  }

  for (const opt of signature.options) {
    const optName = opt.alias ? `-${opt.alias},--${opt.name}` : `--${opt.name}`

    if (opt.isFlag) {
      proto[opt.name] = Option.Boolean(optName, { description: opt.description })
    } else if (opt.isArray) {
      proto[opt.name] = Option.Array(optName, { description: opt.description })
    } else {
      proto[opt.name] = Option.String(optName, { description: opt.description })
    }
  }

  return DynCmd
}
