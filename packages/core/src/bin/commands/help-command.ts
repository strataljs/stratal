import { Command, Option, type Usage } from 'clipanion'
import { CommandNotFoundError } from '../../quarry/errors/command-not-found.error'
import type { QuarryRegistry } from '../../quarry/quarry-registry'

/** Create the built-in `help`/`list` Clipanion command that delegates to Quarry's usage generator. */
export function createHelpCommand(quarry: QuarryRegistry) {
  class HelpCommand extends Command {
    static override paths = [[], ['help'], ['list']]
    static override usage: Usage = Command.Usage({ description: 'Show help for a command' })

    commandPath = Option.Rest()

    async execute(): Promise<number> {
      const commandName = this.commandPath.join(' ')

      if (this.help || !commandName) {
        const listing = await quarry.listUsage({
          binaryName: this.cli.binaryName,
          binaryLabel: this.cli.binaryLabel,
          binaryVersion: this.cli.binaryVersion,
        })
        this.context.stdout.write(listing + '\n')
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
