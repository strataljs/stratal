import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { migrateCommand } from './commands/migrate'
import { pushCommand } from './commands/push'

export function run(): void {
  void yargs(hideBin(process.argv))
    .scriptName('stratal-db')
    .usage('$0 <command> [options]')
    .command(
      'migrate <subcommand>',
      'Run database migrations for a connection',
      (yargs) =>
        yargs
          .positional('subcommand', {
            describe: 'Migration subcommand',
            choices: ['dev', 'deploy', 'status', 'reset'] as const,
            demandOption: true,
          })
          .option('connection', {
            alias: 'c',
            type: 'string',
            describe: 'Connection name',
          })
          .option('all', {
            type: 'boolean',
            describe: 'Run for all connections',
            default: false,
          })
          .option('schema', {
            type: 'string',
            describe: 'Path to main schema.zmodel',
            default: 'schema.zmodel',
          })
          .option('name', {
            alias: 'n',
            type: 'string',
            describe: 'Migration name (for migrate dev)',
          })
          .option('cleanup', {
            type: 'boolean',
            describe: 'Remove generated connection schemas after execution',
            default: true,
          })
          .check((argv) => {
            if (!argv.connection && !argv.all) {
              throw new Error('Specify --connection <name> or --all')
            }
            return true
          }),
      async (argv) => {
        await migrateCommand(argv.subcommand, {
          connection: argv.connection,
          all: argv.all,
          schema: argv.schema,
          name: argv.name,
          cleanup: argv.cleanup,
        })
      },
    )
    .command(
      'push',
      'Push schema to database',
      (yargs) =>
        yargs
          .option('connection', {
            alias: 'c',
            type: 'string',
            describe: 'Connection name',
          })
          .option('all', {
            type: 'boolean',
            describe: 'Run for all connections',
            default: false,
          })
          .option('schema', {
            type: 'string',
            describe: 'Path to main schema.zmodel',
            default: 'schema.zmodel',
          })
          .option('cleanup', {
            type: 'boolean',
            describe: 'Remove generated connection schemas after execution',
            default: true,
          })
          .check((argv) => {
            if (!argv.connection && !argv.all) {
              throw new Error('Specify --connection <name> or --all')
            }
            return true
          }),
      async (argv) => {
        await pushCommand({
          connection: argv.connection,
          all: argv.all,
          schema: argv.schema,
          cleanup: argv.cleanup,
        })
      },
    )
    .demandCommand(1, 'Please specify a command')
    .strict()
    .help()
    .parse()
}
