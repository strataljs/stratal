import { Command, Option, type Usage } from 'clipanion'

import { CommandNotFoundError, type QuarryRegistry } from 'stratal/quarry'

export function createHelpCommand(quarry: QuarryRegistry) {
  class HelpCommand extends Command {
    static override paths = [['help']]
    static override usage: Usage = Command.Usage({ description: 'Show help for a command' })

    commandPath = Option.Rest()

    async execute(): Promise<number> {
      const commandName = this.commandPath.join(' ')

      if (this.help || !commandName) {
        this.context.stdout.write(this.cli.usage())
        return 0
      }

      try {
        const usage = await quarry.usage(commandName)
        this.context.stdout.write(usage + '\n')
        return 0
      } catch (error) {
        if (error instanceof CommandNotFoundError) {
          this.context.stderr.write(`Unknown command: ${commandName}\n`)
          return 1
        }
        throw error
      }
    }
  }

  return HelpCommand
}
