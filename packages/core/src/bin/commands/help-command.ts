import { Command, Option, type Usage } from 'clipanion'

export function createHelpCommand() {
  class HelpCommand extends Command {
    static override paths = [['help']]
    static override usage: Usage = Command.Usage({ description: 'Show help for a command' })

    commandPath = Option.Rest()

    execute(): Promise<number> {
      const commandName = this.commandPath.join(' ')

      if (this.help || !commandName) {
        this.context.stdout.write(this.cli.usage())
        return Promise.resolve(0)
      }

      try {
        const command = this.cli.process(this.commandPath)
        this.context.stdout.write(this.cli.usage(command, { detailed: true }))
        return Promise.resolve(0)
      } catch {
        this.context.stderr.write(`Unknown command: ${commandName}\n`)
        return Promise.resolve(1)
      }
    }
  }

  return HelpCommand
}
