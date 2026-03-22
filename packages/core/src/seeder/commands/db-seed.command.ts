import { inject } from 'tsyringe'
import { Command } from '../../quarry/command'
import { type SeederRegistry, SEEDER_TOKENS } from '../seeder-registry'

export class DbSeedCommand extends Command {
  static command = 'db:seed {names* : Seeder class names} {--a|all : Run all seeders} {--dry-run : Preview without executing}'
  static description = 'Run database seeders'

  constructor(@inject(SEEDER_TOKENS.SeederRegistry) private seeders: SeederRegistry) {
    super()
  }

  async handle(): Promise<number | undefined> {
    const names = this.array('names')
    const all = this.boolean('all')
    const dryRun = this.boolean('dry-run')

    if (names.length > 0 && all) {
      this.warn(`Ignoring "${names.join(', ')}" because --all takes precedence`)
    }

    if (names.length === 0 && !all) {
      this.fail('Specify one or more seeder class names or use --all')
      return 1
    }

    if (dryRun) {
      if (all) {
        const list = this.seeders.list()
        this.info('Dry run — would execute:')
        for (const s of list) {
          this.info(`  ${s.className}`)
        }
      } else {
        this.info('Dry run — would execute:')
        for (const name of names) {
          const SeederClass = this.seeders.find(name)
          if (!SeederClass) {
            this.fail(`Seeder "${name}" not found`)
            return 1
          }
          this.info(`  ${SeederClass.name}`)
        }
      }
      return 0
    }

    if (all) {
      await this.seeders.runAll()
      this.success('All seeders completed')
    } else {
      for (const name of names) {
        const SeederClass = this.seeders.find(name)
        if (!SeederClass) {
          this.fail(`Seeder "${name}" not found`)
          return 1
        }
        await this.seeders.run(SeederClass)
        this.success(`Seeder "${name}" completed`)
      }
    }

    return 0
  }
}
