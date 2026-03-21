import { ZenStackCommand } from './zenstack.command'

export class DbPullCommand extends ZenStackCommand {
  static command = 'db:pull {--schema= : Path to schema file}'
  static description = 'Introspect database and generate schema'

  async handle(): Promise<number> {
    const args = ['db', 'pull']
    const schema = this.string('schema')

    if (schema) args.push('--schema', schema)

    return this.zenstack(args)
  }
}
