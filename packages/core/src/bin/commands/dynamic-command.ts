import { Command, type CommandClass, Option, type Usage } from 'clipanion'

import type { Application } from 'stratal'
import type { QuarryRegistry } from 'stratal/quarry'
import type { ParsedSignature } from 'stratal/quarry'

/** Create Clipanion command classes from Quarry-registered commands. */
export function createDynamicCommands(
  quarry: QuarryRegistry,
  parseSignature: (command: string) => ParsedSignature,
  app: Application,
) {
  const commands: CommandClass[] = []

  for (const entry of quarry.list()) {
    const commandClass = quarry.get(entry.name)! as unknown as { command: string; description?: string; aliases?: string[] }
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

        const result = await app.handleCommand(entry.name, input)

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
      const optDescParts: string[] = []
      if (opt.description) optDescParts.push(opt.description)
      if (opt.default !== undefined) optDescParts.push(`(default: ${opt.default})`)
      const optDesc = optDescParts.length > 0 ? optDescParts.join(' ') : undefined

      if (opt.isFlag) {
        proto[opt.name] = Option.Boolean(optName, { description: optDesc })
      } else if (opt.isArray) {
        if (opt.default !== undefined) {
          proto[opt.name] = Option.Array(optName, [opt.default], { description: optDesc })
        } else {
          proto[opt.name] = Option.Array(optName, { description: optDesc })
        }
      } else {
        if (opt.default !== undefined) {
          proto[opt.name] = Option.String(optName, opt.default, { description: optDesc })
        } else {
          proto[opt.name] = Option.String(optName, { description: optDesc })
        }
      }
    }

    commands.push(DynCmd)
  }

  return commands
}
