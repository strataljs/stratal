import { inject } from 'tsyringe'
import { Transient } from '../../di/decorators'
import { DI_TOKENS } from '../../di/tokens'
import type { InternalLogContext, LogContext, LogEntry } from '../contracts'
import { LOG_LEVEL_PRIORITY, LogLevel } from '../contracts/log-level'
import type { ILogFormatter } from '../formatters/formatter.interface'
import { LOGGER_TOKENS } from '../logger.tokens'
import type { ILogTransport } from '../transports/transport.interface'

/**
 * Logger Service
 *
 * Main logging facade with optional request context enrichment.
 * Singleton service that can be enriched with request context via `withContext()`.
 *
 * **Features:**
 * - Optional request context enrichment (userId) via `withContext()`
 * - Async logging via ctx.waitUntil() for non-blocking performance
 * - Multi-transport support (console, future Sentry/Cloudflare Analytics)
 * - Configurable formatters (JSON production, Pretty development)
 * - Log level filtering based on environment
 *
 * **Architecture:**
 * - Singleton service (available during initialization and request handling)
 * - RouterContext optionally set via `withContext()` method
 * - Uses ConfigService for all configuration (NEVER process.env)
 * - Transports and formatters injected via DI
 *
 * @example Basic usage (no request context)
 * ```typescript
 * @Transient()
 * export class UserService {
 *   constructor(
 *     @inject(LOGGER_TOKENS.LoggerService)
 *     private readonly logger: LoggerService
 *   ) {}
 *
 *   async createUser(input: CreateUserInput) {
 *     this.logger.info('Creating user', { email: input.email })
 *   }
 * }
 * ```
 *
 * @example With request context (in request container)
 * ```typescript
 * // In RequestScopeService
 * const baseLogger = globalContainer.resolve<LoggerService>(LOGGER_TOKENS.LoggerService)
 * const requestLogger = baseLogger.withContext(routerContext)
 * requestContainer.register(LOGGER_TOKENS.LoggerService, { useValue: requestLogger })
 * ```
 */
@Transient()
export class LoggerService {
  constructor(
    @inject(LOGGER_TOKENS.LogLevelOptions)
    private readonly logLevel: LogLevel,

    @inject(DI_TOKENS.ExecutionContext)
    private readonly executionContext: globalThis.ExecutionContext,

    @inject(LOGGER_TOKENS.Formatter)
    private readonly formatter: ILogFormatter,

    @inject(LOGGER_TOKENS.Transports)
    private readonly transports: ILogTransport[],
  ) { }

  /**
   * Log debug message (development only)
   */
  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context)
  }

  /**
   * Log info message
   */
  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context)
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context)
  }

  /**
   * Log error message
   * Accepts Error object or custom context
   */
  error(message: string, contextOrError?: LogContext | Error): void {
    let context: LogContext | undefined
    let error: Error | undefined

    if (contextOrError instanceof Error) {
      error = contextOrError
    } else {
      context = contextOrError
    }

    this.log(LogLevel.ERROR, message, context, error)
  }

  /**
   * Core logging implementation
   * Enriches context, formats message, dispatches to transports
   * Uses ctx.waitUntil() for async non-blocking processing
   */
  private log(
    level: LogLevel,
    message: string,
    userContext?: LogContext,
    error?: Error
  ): void {
    // Filter by configured log level
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.logLevel]) {
      return
    }

    // Build complete log entry with enriched context
    const entry: LogEntry = {
      level,
      message,
      context: this.enrichContext(userContext ?? {}),
      error: error ? this.serializeError(error) : undefined,
    }

    // Format once for all transports
    const formatted = this.formatter.format(entry)

    // Dispatch to all transports asynchronously
    const writePromises = this.transports.map(transport =>
      transport.write(entry, formatted).catch((err: unknown) => {
        // Swallow transport errors to prevent log failure from crashing app
        console.error(`Transport ${transport.name} failed:`, err)
      })
    )

    // Use waitUntil to ensure logs complete even after response sent
    this.executionContext.waitUntil(Promise.all(writePromises))
  }

  /**
   * Enrich log context with request info and timestamp
   * Context enrichment can be extended by application modules
   */
  private enrichContext(userContext: LogContext): InternalLogContext {
    return {
      ...userContext,
      timestamp: Date.now(),
    }
  }

  /**
   * Serialize Error object for transport
   */
  private serializeError(error: Error): { message: string; stack?: string; name?: string } {
    return {
      message: error.message,
      stack: error.stack,
      name: error.name,
    }
  }
}
