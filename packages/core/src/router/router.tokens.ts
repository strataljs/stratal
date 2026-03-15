/**
 * Dependency injection tokens for the router system
 */
export const ROUTER_TOKENS = {
  /**
   * Token for RouterContext (request-scoped)
   * Contains Hono context wrapper with helper methods
   */
  RouterContext: Symbol.for('stratal:router:context'),

  /**
   * Token for LinkBuilder (request-scoped)
   * Builds hypermedia links for resource responses
   */
  LinkBuilder: Symbol.for('stratal:router:link-builder'),
} as const
