import { inject } from '../../di'
import { DI_TOKENS } from '../../di/tokens'
import { Command } from '../command'
import { CommandNotFoundError } from '../errors/command-not-found.error'
import type { QuarryRegistry } from '../quarry-registry'

export class HelpCommand extends Command {
  static command = 'help {command?}'
  static description = 'Show help for a command or list all commands'
  static aliases = ['list']

  constructor(@inject(DI_TOKENS.Quarry) private quarryRegistry: QuarryRegistry) {
    super()
  }

  async handle(): Promise<number | undefined> {
    const commandName = this.string('command')

    if (!commandName) {
      const listing = await this.quarryRegistry.listUsage()
      this.line(listing)
      return 0
    }

    try {
      const usage = await this.quarryRegistry.usage(commandName)
      this.line(usage)
      return 0
    } catch (error) {
      if (error instanceof CommandNotFoundError) {
        this.fail(`Unknown command: ${commandName}`)
        return 1
      }
      throw error
    }
  }
}
