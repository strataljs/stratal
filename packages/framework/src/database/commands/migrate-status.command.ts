import { ZenStackCommand } from './zenstack.command'

export class MigrateStatusCommand extends ZenStackCommand {
  static command = 'migrate:status {--schema= : Path to schema file}'
  static description = 'Check migration status'

  async handle(): Promise<number> {
    const args = ['migrate', 'status']
    const schema = this.string('schema')

    if (schema) args.push('--schema', schema)

    return this.zenstack(args)
  }
}
