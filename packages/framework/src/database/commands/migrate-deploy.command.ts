import { ZenStackCommand } from './zenstack.command'

export class MigrateDeployCommand extends ZenStackCommand {
  static command = 'migrate:deploy {--schema= : Path to schema file}'
  static description = 'Deploy pending migrations'

  async handle(): Promise<number> {
    const args = ['migrate', 'deploy']
    const schema = this.string('schema')

    if (schema) args.push('--schema', schema)

    return this.zenstack(args)
  }
}
