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
   * Token for LocaleUrlService (singleton)
   * Ergonomic wrapper around the pure locale-url helpers — applies, strips,
   * and tests locale prefixes against the resolved LocalePathService config.
   */
  LocaleUrlService: Symbol.for('stratal:router:locale-url-service'),

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

  /**
   * Token for Uri (request-scoped)
   * URL generation service — route URLs, signed URLs, current/previous URL access
   */
  Uri: Symbol.for('stratal:router:uri'),

  /**
   * Token for RouteMetadataRegistry (singleton)
   * Holds per-route schema metadata collected at registration so the OpenAPI
   * document can be generated lazily (on request) without coupling routing to
   * `@hono/zod-openapi`.
   */
  RouteMetadataRegistry: Symbol.for('stratal:router:route-metadata-registry'),
} as const
