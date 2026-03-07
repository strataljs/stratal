/**
 * Dependency injection tokens for the router system
 */
export const ROUTER_TOKENS = {
  /**
   * Token for RouterContext (request-scoped)
   * Contains Hono context wrapper with helper methods
   */
  RouterContext: Symbol.for('RouterContext'),
} as const
