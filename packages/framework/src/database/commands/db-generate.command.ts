import { ZenStackCommand } from './zenstack.command'

export class DbGenerateCommand extends ZenStackCommand {
  static command = 'db:generate {--schema= : Path to schema file} {--watch : Enable watch mode}'
  static description = 'Generate ZenStack ORM client'

  async handle(): Promise<number> {
    const args = ['generate']
    const schema = this.string('schema')

    if (schema) args.push('--schema', schema)
    if (this.boolean('watch')) args.push('--watch')

    return this.zenstack(args)
  }
}
