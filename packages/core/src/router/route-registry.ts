import { inject } from 'tsyringe'
import { Transient } from '../di/decorators'
import { type VERSION_NEUTRAL } from './constants'
import { DuplicateRouteNameError } from './errors'
import { ROUTER_TOKENS } from './router.tokens'
import type { LocalePathService } from './services/locale-path.service'
import type { VersioningService } from './services/versioning.service'
import type { HttpMethod } from './types'
import { sortRoutesBySpecificity } from './utils/path'
import { extractDomainParamNames, extractParamNames } from './utils/route-name'

/**
 * A single registered route in the application.
 * Tracks both named and unnamed routes, HTTP and WebSocket.
 */
export interface RegisteredRoute {
  /** Route name for URL generation (undefined = unnamed, still tracked) */
  name?: string
  /** HTTP method or 'ws' for WebSocket gateways */
  method: HttpMethod | 'ws'
  /** Primary path in Hono-style :param format */
  path: string
  /** Locale-prefixed path variants (e.g., '/:locale/users/:id') */
  localePaths?: string[]
  /** Parameter names extracted from path */
  paramNames: string[]
  /** Domain pattern (e.g., '{tenant}.example.com') */
  domain?: string
  /** Parameter names extracted from domain */
  domainParamNames: string[]
  /** Controller class name */
  controller: string
  /** Controller method name */
  action: string
  /** Whether the route is hidden from OpenAPI docs */
  hidden: boolean
  /** Middleware class names applied to this route */
  middleware: string[]
  /** Whether this is a locale-prefixed variant */
  isLocaleVariant?: boolean
}

/**
 * Input for registering a route. The registry auto-extracts param names
 * and expands versioned/locale paths via injected services.
 */
export type RouteRegistrationInput = Omit<RegisteredRoute, 'paramNames' | 'domainParamNames' | 'path' | 'localePaths' | 'isLocaleVariant'> & {
  /** Base path before versioning/locale expansion */
  basePath: string
  /** Version from controller/router config (used by VersioningService). Accepts VERSION_NEUTRAL symbol. */
  version?: string | string[] | typeof VERSION_NEUTRAL
  /** Pre-computed param names (optional, auto-extracted if omitted) */
  paramNames?: string[]
  /** Pre-computed domain param names (optional, auto-extracted if omitted) */
  domainParamNames?: string[]
}

/**
 * Central registry for all application routes.
 * Single source of truth — used by `route:list`, `route:types`, and URL generation.
 *
 * Routes are automatically expanded via VersioningService and LocalePathService
 * during registration, and sorted by specificity when retrieved via `all()`.
 *
 * Registered as a singleton in the container.
 */
@Transient()
export class RouteRegistry {
  private readonly routes: RegisteredRoute[] = []
  private readonly namedRoutes = new Map<string, RegisteredRoute>()
  private _sortedCache: RegisteredRoute[] | null = null

  constructor(
    @inject(ROUTER_TOKENS.VersioningService) private readonly versioningService: VersioningService,
    @inject(ROUTER_TOKENS.LocalePathService) private readonly localePathService: LocalePathService,
  ) { }

  /**
   * Register a route. Expands via VersioningService + LocalePathService.
   * Named routes must have unique names.
   *
   * @returns Array of expanded RegisteredRoute entries (primary + locale variants)
   * @throws DuplicateRouteNameError if a named route with the same name already exists
   */
  register(input: RouteRegistrationInput): RegisteredRoute[] {
    const domainParamNames = input.domainParamNames ?? (input.domain ? extractDomainParamNames(input.domain) : [])

    // Expand via VersioningService
    const versionedPaths = this.versioningService.resolve(input.basePath, input.version)

    const expandedRoutes: RegisteredRoute[] = []

    for (const versionedPath of versionedPaths) {
      // Expand via LocalePathService
      const resolvedPaths = this.localePathService.resolve(versionedPath)

      // Collect locale variant paths (for the primary route's localePaths field)
      const localeVariantPaths = resolvedPaths
        .filter(p => p.isLocaleVariant)
        .map(p => p.path)

      for (const resolved of resolvedPaths) {
        const route: RegisteredRoute = {
          name: resolved.isLocaleVariant ? undefined : input.name,
          method: input.method,
          path: resolved.path,
          localePaths: resolved.isLocaleVariant ? undefined : (localeVariantPaths.length > 0 ? localeVariantPaths : undefined),
          paramNames: extractParamNames(resolved.path),
          domain: input.domain,
          domainParamNames,
          controller: input.controller,
          action: input.action,
          hidden: input.hidden,
          middleware: input.middleware,
          isLocaleVariant: resolved.isLocaleVariant || undefined,
        }

        // Register name only for primary routes (not locale variants)
        if (route.name) {
          if (this.namedRoutes.has(route.name)) {
            const existing = this.namedRoutes.get(route.name)!
            throw new DuplicateRouteNameError(
              route.name,
              `${existing.controller}.${existing.action}`,
              `${route.controller}.${route.action}`,
            )
          }
          this.namedRoutes.set(route.name, route)
        }

        this.routes.push(route)
        this._sortedCache = null
        expandedRoutes.push(route)
      }
    }

    return expandedRoutes
  }

  /** Get a named route by name */
  get(name: string): RegisteredRoute | undefined {
    return this.namedRoutes.get(name)
  }

  /** Check if a named route exists */
  has(name: string): boolean {
    return this.namedRoutes.has(name)
  }

  /** Get all routes sorted by specificity (static > param > wildcard, primary before locale) */
  all(): RegisteredRoute[] {
    this._sortedCache ??= sortRoutesBySpecificity(this.routes);
    return this._sortedCache
  }

  /** Get only named routes */
  named(): RegisteredRoute[] {
    return [...this.namedRoutes.values()]
  }
}
