import { inject } from 'tsyringe'
import { Command } from '../../quarry/command'
import { type SeederRegistry, SEEDER_TOKENS } from '../seeder-registry'

export class DbSeedCommand extends Command {
  static command = 'db:seed {name? : Seeder class name} {--a|all : Run all seeders} {--dry-run : Preview without executing}'
  static description = 'Run database seeders'

  constructor(@inject(SEEDER_TOKENS.SeederRegistry) private seeders: SeederRegistry) {
    super()
  }

  async handle(): Promise<number | undefined> {
    const name = this.string('name')
    const all = this.boolean('all')
    const dryRun = this.boolean('dry-run')

    if (!name && !all) {
      this.fail('Specify a seeder class name or use --all')
      return 1
    }

    if (dryRun) {
      const list = this.seeders.list()
      if (all) {
        this.info('Dry run — would execute:')
        for (const s of list) {
          this.info(`  ${s.className}`)
        }
      } else {
        const SeederClass = this.seeders.find(name)
        if (!SeederClass) {
          this.fail(`Seeder "${name}" not found`)
          return 1
        }
        this.info(`Dry run — would execute: ${SeederClass.name}`)
      }
      return 0
    }

    if (all) {
      await this.seeders.runAll()
      this.success('All seeders completed')
    } else {
      const SeederClass = this.seeders.find(name)
      if (!SeederClass) {
        this.fail(`Seeder "${name}" not found`)
        return 1
      }
      await this.seeders.run(SeederClass)
      this.success(`Seeder "${name}" completed`)
    }

    return 0
  }
}
