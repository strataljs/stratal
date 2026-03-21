import { ZenStackCommand } from './zenstack.command'

export class MigrateDevCommand extends ZenStackCommand {
  static command = 'migrate:dev {--schema= : Path to schema file} {--name= : Migration name} {--create-only : Create without applying}'
  static description = 'Create and apply migration'

  async handle(): Promise<number> {
    const args = ['migrate', 'dev']
    const schema = this.string('schema')
    const name = this.string('name')

    if (schema) args.push('--schema', schema)
    if (name) args.push('--name', name)
    if (this.boolean('create-only')) args.push('--create-only')

    return this.zenstack(args)
  }
}
