import { Command, type CommandClass, Option, type Usage } from 'clipanion'

import type { Application } from 'stratal'
import type { QuarryRegistry } from 'stratal/quarry'
import type { CommandResult, ParsedSignature } from 'stratal/quarry'

export function createDynamicCommands(
  quarry: QuarryRegistry,
  parseSignature: (command: string) => ParsedSignature,
  app: Application,
) {
  const commands: CommandClass[] = []

  for (const entry of quarry.list()) {
    const commandInstance = quarry.get(entry.name)!
    const commandClass = commandInstance.constructor as unknown as { command: string; description?: string; aliases?: string[] }
    const signature = parseSignature(commandClass.command)

    const paths: string[][] = [entry.name.split(' ')]
    if (commandClass.aliases) {
      for (const alias of commandClass.aliases) {
        paths.push(alias.split(' '))
      }
    }

    class DynCmd extends Command {
      static override paths = paths
      static override usage: Usage | undefined = commandClass.description
        ? Command.Usage({ description: commandClass.description })
        : undefined

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
          return quarry.call(entry.name, input)
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

    commands.push(DynCmd)
  }

  return commands
}
