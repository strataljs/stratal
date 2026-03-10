/**
 * OpenAPI Module DI Tokens
 */
export const OPENAPI_TOKENS = {
  /** Static options provided via forRoot() */
  Options: Symbol.for('stratal:openapi:options'),

  /** Request-scoped config service that supports runtime overrides */
  ConfigService: Symbol.for('stratal:openapi:config:service'),

  /** OpenAPI service that generates specs and serves endpoints */
  OpenAPIService: Symbol.for('stratal:openapi:service'),
} as const
