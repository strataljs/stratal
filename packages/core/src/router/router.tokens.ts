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
   * Token for RouteRegistry (singleton)
   * Central registry of all application routes — source of truth for route:list, route:types, URL generation
   */
  RouteRegistry: Symbol.for('stratal:router:route-registry'),
} as const
