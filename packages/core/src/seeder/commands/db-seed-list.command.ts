import { inject } from 'tsyringe'
import { Command } from '../../quarry/command'
import { type SeederRegistry, SEEDER_TOKENS } from '../seeder-registry'

export class DbSeedListCommand extends Command {
  static command = 'db:seed:list'
  static description = 'List available database seeders'

  constructor(@inject(SEEDER_TOKENS.SeederRegistry) private seeders: SeederRegistry) {
    super()
  }

  handle(): undefined | number {
    const list = this.seeders.list()
    if (list.length === 0) {
      this.info('No seeders found')
      return 0
    }
    this.table(['Class'], list.map(s => [s.className]))

    return undefined
  }
}
