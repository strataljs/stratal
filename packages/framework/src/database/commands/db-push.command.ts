import { ZenStackCommand } from './zenstack.command'

export class DbPushCommand extends ZenStackCommand {
  static command = 'db:push {--schema= : Path to schema file} {--accept-data-loss : Accept data loss} {--force-reset : Force reset database}'
  static description = 'Push database schema changes'

  async handle(): Promise<number> {
    const args = ['db', 'push']
    const schema = this.string('schema')

    if (schema) args.push('--schema', schema)
    if (this.boolean('accept-data-loss')) args.push('--accept-data-loss')
    if (this.boolean('force-reset')) args.push('--force-reset')

    return this.zenstack(args)
  }
}
