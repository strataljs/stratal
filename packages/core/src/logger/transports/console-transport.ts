import { Transient } from '../../di/decorators'
import { LOGGER_TOKENS } from '../logger.tokens'
import { BaseTransport } from './base-transport'
import type { LogEntry } from '../contracts'
import { LogLevel } from '../contracts'

/**
 * Console Transport
 *
 * Writes logs to console using appropriate console methods.
 * Maps log levels to console.debug, console.info, console.warn, console.error.
 *
 * Thread-safe for Cloudflare Workers environment.
 */
@Transient(LOGGER_TOKENS.ConsoleTransport)
export class ConsoleTransport extends BaseTransport {
  readonly name = 'console'

  write(entry: LogEntry, formatted: string): Promise<void> {
    try {
      const consoleMethod = this.getConsoleMethod(entry.level)
      consoleMethod(formatted)
    } catch (error) {
      this.handleError(error, entry)
    }

    return Promise.resolve()
  }

  /**
   * Map log level to console method
   */
  private getConsoleMethod(level: LogLevel): typeof console.log {
    switch (level) {
      case LogLevel.DEBUG:
        return console.debug
      case LogLevel.INFO:
        return console.info
      case LogLevel.WARN:
        return console.warn
      case LogLevel.ERROR:
        return console.error
      default:
        return console.log
    }
  }
}
