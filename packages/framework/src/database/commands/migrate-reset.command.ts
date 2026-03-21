import { ZenStackCommand } from './zenstack.command'

export class MigrateResetCommand extends ZenStackCommand {
  static command = 'migrate:reset {--schema= : Path to schema file} {--force : Skip confirmation} {--skip-seed : Skip seeding}'
  static description = 'Reset database'

  async handle(): Promise<number> {
    const args = ['migrate', 'reset']
    const schema = this.string('schema')

    if (schema) args.push('--schema', schema)
    if (this.boolean('force')) args.push('--force')
    if (this.boolean('skip-seed')) args.push('--skip-seed')

    return this.zenstack(args)
  }
}
