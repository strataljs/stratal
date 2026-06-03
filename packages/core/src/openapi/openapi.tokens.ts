/**
 * OpenAPI Module DI Tokens
 */
export const OPENAPI_TOKENS = {
  /** Static options provided via forRoot() */
  Options: Symbol.for('stratal:openapi:options'),

  /**
   * Singleton holder of the static base config. Resolvable outside a request
   * (bootstrap endpoint mounting, CLI commands) for static config — never throws
   * on resolve and carries no per-request state.
   */
  ConfigStore: Symbol.for('stratal:openapi:config:store'),

  /** Request-scoped config service that layers runtime overrides over the store */
  ConfigService: Symbol.for('stratal:openapi:config:service'),

  /** OpenAPI service that generates specs and serves endpoints */
  OpenAPIService: Symbol.for('stratal:openapi:service'),
} as const
