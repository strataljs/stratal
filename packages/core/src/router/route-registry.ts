import type { HttpMethod } from './types'
import { extractDomainParamNames, extractParamNames } from './utils/route-name'
import { sortRoutesBySpecificity } from './utils/path'

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
  /** Locale-prefixed path variants (e.g., '/{locale}/users/:id') */
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
}

/**
 * Central registry for all application routes.
 * Single source of truth — used by `route:list`, `route:types`, and URL generation.
 *
 * Routes are automatically sorted by specificity when retrieved via `all()`.
 */
export class RouteRegistry {
  private readonly routes: RegisteredRoute[] = []
  private readonly namedRoutes = new Map<string, RegisteredRoute>()

  /**
   * Register a route. Named routes must have unique names.
   * @throws Error if a named route with the same name already exists
   */
  register(route: RegisteredRoute): void {
    if (route.name) {
      if (this.namedRoutes.has(route.name)) {
        throw new Error(
          `Duplicate route name '${route.name}'. ` +
          `Already registered by ${this.namedRoutes.get(route.name)!.controller}.${this.namedRoutes.get(route.name)!.action}, ` +
          `cannot register ${route.controller}.${route.action}.`
        )
      }
      this.namedRoutes.set(route.name, route)
    }
    this.routes.push(route)
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
    return sortRoutesBySpecificity(this.routes)
  }

  /** Get only named routes */
  named(): RegisteredRoute[] {
    return [...this.namedRoutes.values()]
  }

  /**
   * Generate a URL from a named route.
   *
   * Keys in `params` matching `:param` placeholders fill the path.
   * Domain params (e.g., `{tenant}`) are also consumed from `params`.
   * Extra keys become query string parameters.
   *
   * @throws Error if route name not found or required params missing
   */
  url(name: string, params?: Record<string, string>): string {
    const route = this.namedRoutes.get(name)
    if (!route) {
      throw new Error(`Route '${name}' not found in registry.`)
    }

    const allParams = { ...params }
    const consumedKeys = new Set<string>()
    let url = route.path

    // Fill path :param placeholders
    for (const paramName of route.paramNames) {
      const value = allParams[paramName]
      if (value === undefined) {
        throw new Error(
          `Missing required param '${paramName}' for route '${name}' (path: ${route.path}).`
        )
      }
      url = url.replace(`:${paramName}`, encodeURIComponent(value))
      consumedKeys.add(paramName)
    }

    // Build domain if present
    let domain: string | undefined
    if (route.domain) {
      domain = route.domain
      for (const domainParam of route.domainParamNames) {
        const value = allParams[domainParam]
        if (value === undefined) {
          throw new Error(
            `Missing required domain param '${domainParam}' for route '${name}' (domain: ${route.domain}).`
          )
        }
        domain = domain.replace(`{${domainParam}}`, encodeURIComponent(value))
        consumedKeys.add(domainParam)
      }
    }

    // Remaining params (not consumed by path or domain) become query string
    const queryEntries = Object.entries(allParams).filter(([key]) => !consumedKeys.has(key))
    if (queryEntries.length > 0) {
      const queryString = queryEntries
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&')
      url = `${url}?${queryString}`
    }

    // Prepend domain if present
    if (domain) {
      url = `https://${domain}${url}`
    }

    return url
  }

  /**
   * Create a RegisteredRoute with auto-extracted param names.
   * Convenience factory that extracts paramNames and domainParamNames automatically.
   */
  static createRoute(
    route: Omit<RegisteredRoute, 'paramNames' | 'domainParamNames'> & {
      paramNames?: string[]
      domainParamNames?: string[]
    }
  ): RegisteredRoute {
    return {
      ...route,
      paramNames: route.paramNames ?? extractParamNames(route.path),
      domainParamNames: route.domainParamNames ?? (route.domain ? extractDomainParamNames(route.domain) : []),
    }
  }
}
