/**
 * Dependency Injection Tokens for Logger Module
 *
 * Symbol-based tokens ensure type-safe dependency injection
 * and prevent naming collisions.
 */
export const LOGGER_TOKENS = {
  /**
   * Main logger service facade
   */
  LoggerService: Symbol.for('Logger.LoggerService'),

  /**
   * Log formatter (JSON or Pretty)
   */
  Formatter: Symbol.for('Logger.Formatter'),

  /**
   * Array of active transports
   */
  Transports: Symbol.for('Logger.Transports'),

  /**
   * Individual transport tokens (for factory registration)
   */
  ConsoleTransport: Symbol.for('Logger.ConsoleTransport'),

  /**
   * Configured log level for filtering
   */
  LogLevelOptions: Symbol.for('Logger.LogLevelOptions'),
} as const
