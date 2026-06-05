import { inject } from '../../di'
import { Transient } from '../../di/decorators'
import type { InternalLogContext, LogContext, LogEntry } from '../contracts'
import { LOG_LEVEL_PRIORITY, LogLevel } from '../contracts/log-level'
import type { ILogFormatter } from '../formatters/formatter.interface'
import { LOGGER_TOKENS } from '../logger.tokens'

@Transient()
export class LoggerService {
  constructor(
    @inject(LOGGER_TOKENS.LogLevelOptions)
    private readonly logLevel: LogLevel,

    @inject(LOGGER_TOKENS.Formatter)
    private readonly formatter: ILogFormatter,
  ) { }

  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context)
  }

  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context)
  }

  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context)
  }

  error(message: string, error: Error, context?: LogContext): void
  error(message: string, context?: LogContext): void
  error(message: string, errorOrContext?: Error | LogContext, maybeContext?: LogContext): void {
    let context: LogContext | undefined
    let error: Error | undefined

    if (errorOrContext instanceof Error) {
      error = errorOrContext
      context = maybeContext
    } else {
      context = errorOrContext
    }

    this.log(LogLevel.ERROR, message, context, error)
  }

  private log(
    level: LogLevel,
    message: string,
    userContext?: LogContext,
    error?: Error
  ): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.logLevel]) {
      return
    }

    const entry: LogEntry = {
      level,
      message,
      context: this.enrichContext(userContext ?? {}),
      error: error ? this.serializeError(error) : undefined,
    }

    const formatted = this.formatter.format(entry)
    this.writeToConsole(level, formatted)
  }

  private writeToConsole(level: LogLevel, formatted: string): void {
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formatted)
        break
      case LogLevel.INFO:
        console.info(formatted)
        break
      case LogLevel.WARN:
        console.warn(formatted)
        break
      case LogLevel.ERROR:
        console.error(formatted)
        break
    }
  }

  private enrichContext(userContext: LogContext): InternalLogContext {
    return {
      ...userContext,
      timestamp: Date.now(),
    }
  }

  private serializeError(error: Error): { message: string; stack?: string; name?: string } {
    return {
      message: error.message,
      stack: error.stack,
      name: error.name,
    }
  }
}
