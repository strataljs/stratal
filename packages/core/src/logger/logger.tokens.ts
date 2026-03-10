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
  LoggerService: Symbol.for('stratal:logger:service'),

  /**
   * Log formatter (JSON or Pretty)
   */
  Formatter: Symbol.for('stratal:logger:formatter'),

  /**
   * Array of active transports
   */
  Transports: Symbol.for('stratal:logger:transports'),

  /**
   * Individual transport tokens (for factory registration)
   */
  ConsoleTransport: Symbol.for('stratal:logger:console:transport'),

  /**
   * Configured log level for filtering
   */
  LogLevelOptions: Symbol.for('stratal:logger:log:level:options'),
} as const
