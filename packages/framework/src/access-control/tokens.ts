export const AC_TOKENS = {
  /** Request-scoped access service */
  AccessService: Symbol.for('stratal:ac:service'),
  /** Access control module options (ac, roles) */
  Options: Symbol.for('stratal:ac:options'),
} as const
