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

  /**
   * Token for VersioningService (singleton)
   * Resolves version prefixes for route paths
   */
  VersioningService: Symbol.for('stratal:router:versioning-service'),

  /**
   * Token for LocalePathService (singleton)
   * Resolves locale path variants and computes LocalePathConfig
   */
  LocalePathService: Symbol.for('stratal:router:locale-path-service'),

  /**
   * Token for RouterResolver (singleton, may be null)
   * Internal resolver that computes effective Router config per controller
   */
  RouterResolver: Symbol.for('stratal:router:router-resolver'),

  /**
   * Token for HonoApp (singleton)
   * The Hono application instance with Stratal-specific setup
   */
  HonoApp: Symbol.for('stratal:router:hono-app'),
} as const
