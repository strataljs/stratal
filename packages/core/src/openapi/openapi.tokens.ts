/**
 * OpenAPI Module DI Tokens
 */
export const OPENAPI_TOKENS = {
  /** Static options provided via forRoot() */
  Options: Symbol.for('OpenAPIModule.Options'),

  /** Request-scoped config service that supports runtime overrides */
  ConfigService: Symbol.for('OpenAPIModule.ConfigService'),

  /** OpenAPI service that generates specs and serves endpoints */
  OpenAPIService: Symbol.for('OpenAPIModule.OpenAPIService'),
} as const
