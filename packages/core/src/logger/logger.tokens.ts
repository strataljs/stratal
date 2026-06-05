export const LOGGER_TOKENS = {
  LoggerService: Symbol.for('stratal:logger:service'),
  Formatter: Symbol.for('stratal:logger:formatter'),
  LogLevelOptions: Symbol.for('stratal:logger:log:level:options'),
} as const
