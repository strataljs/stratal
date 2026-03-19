import { Command, type Usage } from 'clipanion'

import type { QuarryRegistry } from 'stratal/quarry'

export function createListCommand(quarry: QuarryRegistry) {
  class ListCommand extends Command {
    static override paths = [['list']]
    static override usage: Usage = Command.Usage({ description: 'List all available commands' })

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
