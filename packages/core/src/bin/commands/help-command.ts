import { Command, Option, type Usage } from 'clipanion'

import type { QuarryRegistry } from 'stratal/quarry'

export function createHelpCommand(quarry: QuarryRegistry) {
  class HelpCommand extends Command {
    static override paths = [['help']]
    static override usage: Usage = Command.Usage({ description: 'Show help for a command' })

    commandName = Option.String({ required: false })

    async execute(): Promise<number> {
      if (this.help || !this.commandName) {
        this.context.stdout.write(this.cli.usage())
        return 0
      }

      const usage = await quarry.usage(this.commandName)
      this.context.stdout.write(usage + '\n')
      return 0
    }
  }

  return HelpCommand
}
