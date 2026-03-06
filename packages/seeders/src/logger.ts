import chalk from 'chalk'

export class SeederLogger {
  info(message: string, ...args: unknown[]): void {
    console.log(chalk.cyan('i'), message, ...args)
  }

  success(message: string, ...args: unknown[]): void {
    console.log(chalk.green('✓'), message, ...args)
  }

  error(message: string, ...args: unknown[]): void {
    console.error(chalk.red('✗'), message, ...args)
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(chalk.yellow('!'), message, ...args)
  }

  debug(message: string, ...args: unknown[]): void {
    console.log(chalk.gray('~'), message, ...args)
  }

  section(message: string): void {
    console.log(chalk.bold.white(`\n${message}`))
  }

  plain(message: string, ...args: unknown[]): void {
    console.log(message, ...args)
  }
}

export const logger = new SeederLogger()
