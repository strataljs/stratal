/**
 * Type-safe context keys for Hono router variables
 * Using symbols to avoid string collisions
 */
export const ROUTER_CONTEXT_KEYS = {
  REQUEST_CONTAINER: 'requestContainer',
  LOCALE: 'locale'
} as const satisfies Record<string, string>

/**
 * Metadata keys for storing route and controller configuration
 * Using symbols to avoid collisions with other decorators
 */
export const ROUTE_METADATA_KEYS = {
  CONTROLLER_ROUTE: Symbol.for('stratal:controller:route'),
  CONTROLLER_OPTIONS: Symbol.for('stratal:controller:options'),
  CONTROLLER_MIDDLEWARES: Symbol.for('stratal:controller:middlewares'),
  ROUTE_CONFIG: Symbol.for('stratal:route:config'),
  DECORATED_METHODS: Symbol.for('stratal:decorated:methods'),
  AUTH_GUARD: Symbol.for('stratal:auth:guard')
} as const

/**
 * Security scheme identifiers for OpenAPI
 * These reference the security scheme definitions in security.schemas.ts
 */
export const SECURITY_SCHEMES = {
  BEARER_AUTH: 'bearerAuth',
  API_KEY: 'apiKey',
  SESSION_COOKIE: 'sessionCookie'
} as const

/**
 * HTTP method mapping for RESTful controller methods
 * Maps controller method names to HTTP verbs and path patterns
 */
export const HTTP_METHODS = {
  index: { method: 'get', path: '' } as const,
  show: { method: 'get', path: '/:id' } as const,
  create: { method: 'post', path: '' } as const,
  update: { method: 'put', path: '/:id' } as const,
  patch: { method: 'patch', path: '/:id' } as const,
  destroy: { method: 'delete', path: '/:id' } as const
} as const

/**
 * Default success status codes for RESTful controller methods
 * Used by @Route() decorator to auto-derive response status
 */
export const METHOD_STATUS_CODES = {
  index: 200,
  show: 200,
  create: 201,
  update: 200,
  patch: 200,
  destroy: 200
} as const
