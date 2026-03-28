import type { Context } from 'hono'
import type { Container } from '../di'
import type { OpenAPIHono } from '../i18n/validation'
import type { LoggerService } from '../logger'
import { HTTP_METHODS } from '../router/constants'
import type { IController } from '../router/controller'
import { getControllerRoute } from '../router/decorators/controller.decorator'
import { getRouteDecoratedMethods, getRouteMetadata } from '../router/decorators/route.decorator'
import type { Middleware } from '../router/middleware.interface'
import { RouterContext } from '../router/router-context'
import type { HttpMethod, RouterEnv, VersioningOptions } from '../router/types'
import type { Constructor } from '../types'
import type { MiddlewareConfigEntry, MiddlewareRouteTarget, RouteInfo } from './types'

/**
 * Service for applying middleware configurations to Hono app
 *
 * Processes MiddlewareConfigEntry[] from modules and registers
 * appropriate middleware handlers with route matching.
 */
export class MiddlewareConfigurationService {
  constructor(
    private readonly logger: LoggerService,
    private readonly versioningOptions: VersioningOptions | null = null,
  ) { }

  /**
   * Apply middleware configurations to the Hono app
   *
   * @param app - Hono application instance
   * @param configs - Middleware configuration entries from modules
   * @param controllers - All registered controller classes (for route resolution)
   * @param container - DI container for resolving middleware instances
   */
  applyMiddlewares(
    app: OpenAPIHono<RouterEnv>,
    configs: MiddlewareConfigEntry[],
    controllers: Constructor<IController>[],
    container: Container
  ): void {
    for (const config of configs) {
      this.applyMiddlewareConfig(app, config, controllers, container)
    }
  }

  /**
   * Apply a single middleware configuration entry
   */
  private applyMiddlewareConfig(
    app: OpenAPIHono<RouterEnv>,
    config: MiddlewareConfigEntry,
    controllers: Constructor<IController>[],
    container: Container
  ): void {
    const { middlewares, excludes, routes } = config

    // Resolve route patterns from targets
    const routePatterns = this.resolveRoutePatterns(routes, controllers)

    // Log the configuration for debugging
    this.logger.debug('Applying middleware configuration', {
      middlewares: middlewares.map(m => m.name),
      routes: routePatterns,
      excludes: excludes,
    })

    // Apply middleware to each route pattern
    for (const pattern of routePatterns) {
      this.registerMiddlewareForPattern(app, middlewares, pattern, excludes, container)
    }
  }

  /**
   * Resolve route targets into concrete route patterns
   */
  private resolveRoutePatterns(
    targets: MiddlewareRouteTarget[],
    _controllers: Constructor<IController>[]
  ): RouteInfo[] {
    const patterns: RouteInfo[] = []

    for (const target of targets) {
      if (typeof target === 'string') {
        // String path — '*' for global or a specific path pattern
        patterns.push({ path: target })
      } else if (typeof target === 'function') {
        // Controller class — resolve exact method paths, not wildcard
        const basePath = getControllerRoute(target)
        if (!basePath) {
          this.logger.warn('Controller has no route metadata', { controller: target.name })
          continue
        }

        const decoratedMethods = getRouteDecoratedMethods(target as new (...args: unknown[]) => object)

        // handle()-based controllers have no decorated methods — use wildcard
        if (decoratedMethods.length === 0) {
          patterns.push({ path: `${basePath}/*` })
          patterns.push({ path: basePath })
          continue
        }

        // Resolve each method's exact path + HTTP method
        for (const methodName of decoratedMethods) {
          const meta = getRouteMetadata(target.prototype as object, methodName)
          if (!meta) continue

          if (meta.type === 'explicit') {
            const methodPath = meta.path === '/' ? '' : meta.path
            const fullPath = this.joinPaths(basePath, methodPath)
            patterns.push({ path: fullPath, method: meta.method })
          } else {
            // Convention-based — derive from method name
            const mapping = HTTP_METHODS[methodName as keyof typeof HTTP_METHODS]
            if (mapping) {
              const fullPath = this.joinPaths(basePath, mapping.path)
              patterns.push({ path: fullPath, method: mapping.method as HttpMethod })
            }
          }
        }
      } else {
        // RouteInfo object - resolve version if present
        if (!this.versioningOptions || !target.version) {
          // Fast path: no versioning or no version on target — push directly
          patterns.push(target)
        } else {
          const resolved = this.resolveVersionedRouteInfo(target)
          patterns.push(...resolved)
        }
      }
    }

    return patterns
  }

  /**
   * Resolve a RouteInfo with version into versioned path(s).
   * If versioning is disabled or no version is specified, returns the RouteInfo as-is.
   */
  private resolveVersionedRouteInfo(routeInfo: RouteInfo): RouteInfo[] {
    if (!this.versioningOptions || !routeInfo.version) {
      return [routeInfo]
    }

    const prefix = this.versioningOptions.prefix ?? 'v'
    const versions = Array.isArray(routeInfo.version) ? routeInfo.version : [routeInfo.version]
    const results: RouteInfo[] = []

    for (const v of versions) {
      const versionedPath = `/${prefix}${v}${routeInfo.path}`
      // Add exact path match
      results.push({ path: versionedPath, method: routeInfo.method })
      // Add wildcard match for sub-paths
      results.push({ path: `${versionedPath}/*`, method: routeInfo.method })
    }

    return results
  }

  /**
   * Register middleware handlers for a specific route pattern
   */
  private registerMiddlewareForPattern(
    app: OpenAPIHono<RouterEnv>,
    middlewares: Constructor<Middleware>[],
    pattern: RouteInfo,
    excludes: RouteInfo[],
    container: Container
  ): void {
    const path = pattern.path
    const methods = pattern.method
      ? (Array.isArray(pattern.method) ? pattern.method : [pattern.method])
      : undefined

    // Create the middleware handler
    const handler = this.createMiddlewareHandler(middlewares, excludes, container)

    // Register with Hono
    if (methods && methods.length > 0) {
      // Method-specific registration
      for (const method of methods) {
        this.registerForMethod(app, method, path, handler)
      }
    } else {
      // All methods
      app.use(path, handler)
    }
  }

  /**
   * Register handler for a specific HTTP method
   */
  private registerForMethod(
    app: OpenAPIHono<RouterEnv>,
    method: HttpMethod,
    path: string,
    handler: (c: Context<RouterEnv>, next: () => Promise<void>) => Promise<Response | void>
  ): void {
    switch (method) {
      case 'get':
        app.get(path, handler)
        break
      case 'post':
        app.post(path, handler)
        break
      case 'put':
        app.put(path, handler)
        break
      case 'delete':
        app.delete(path, handler)
        break
      case 'patch':
        app.patch(path, handler)
        break
      default:
        app.use(path, handler)
    }
  }

  /**
   * Create a middleware handler function that executes the middleware chain
   */
  private createMiddlewareHandler(
    middlewares: Constructor<Middleware>[],
    excludes: RouteInfo[],
    container: Container
  ): (c: Context<RouterEnv>, next: () => Promise<void>) => Promise<Response | void> {
    return async (c, next) => {
      const requestPath = c.req.path
      const requestMethod = c.req.method.toLowerCase() as HttpMethod

      // Check if this request should be excluded
      if (this.isExcluded(requestPath, requestMethod, excludes)) {
        await next()
        return
      }

      // Create RouterContext for middleware
      const ctx = new RouterContext(c)

      // Execute middleware chain — if a middleware returns a Response (e.g. redirect),
      // return it to Hono to short-circuit the request (idiomatic Hono pattern)
      return this.executeMiddlewareChain(middlewares, ctx, container, next)
    }
  }

  /**
   * Check if a request matches any exclusion pattern
   */
  private isExcluded(
    requestPath: string,
    requestMethod: HttpMethod,
    excludes: RouteInfo[]
  ): boolean {
    for (const exclude of excludes) {
      if (this.matchesRoute(requestPath, requestMethod, exclude)) {
        return true
      }
    }
    return false
  }

  /**
   * Check if request matches a route pattern
   */
  private matchesRoute(
    requestPath: string,
    requestMethod: HttpMethod,
    route: RouteInfo
  ): boolean {
    // Check method match (if specified)
    if (route.method) {
      const methods = Array.isArray(route.method) ? route.method : [route.method]
      if (!methods.includes(requestMethod)) {
        return false
      }
    }

    // Check path match
    return this.matchesPath(requestPath, route.path)
  }

  /**
   * Match request path against pattern
   * Supports wildcards: /api/* matches /api/users, /api/v1/users
   */
  private matchesPath(requestPath: string, pattern: string): boolean {
    // Exact match
    if (pattern === requestPath) {
      return true
    }

    // Global wildcard
    if (pattern === '*') {
      return true
    }

    // Wildcard pattern (e.g., /api/*)
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2)
      return requestPath === prefix || requestPath.startsWith(prefix + '/')
    }

    // Path parameter pattern (e.g., /api/users/:id)
    // Convert to regex for matching
    const regexPattern = pattern
      .replace(/:[^/]+/g, '[^/]+') // Replace :param with regex
      .replace(/\*/g, '.*') // Replace * with regex
    const regex = new RegExp(`^${regexPattern}$`)
    return regex.test(requestPath)
  }

  /**
   * Execute middleware chain in order
   *
   * If any middleware returns a Response (e.g. a redirect), the chain stops
   * and that Response is returned to the caller for Hono to use directly.
   */
  private async executeMiddlewareChain(
    middlewares: Constructor<Middleware>[],
    ctx: RouterContext,
    container: Container,
    finalNext: () => Promise<void>
    // oxlint-disable-next-line typescript/no-invalid-void-type
  ): Promise<Response | void> {
    // Capture early Response from any middleware in the chain
    let earlyResponse: Response | undefined

    // Build middleware chain from end to start
    let chain = finalNext

    for (let i = middlewares.length - 1; i >= 0; i--) {
      const MiddlewareClass = middlewares[i]
      const currentNext = chain

      chain = async () => {
        // Skip remaining chain if a previous middleware already returned a Response
        if (earlyResponse) return

        // Resolve middleware from request-scoped container
        const requestContainer = ctx.getContainer()
        const middleware = requestContainer.resolve<Middleware>(MiddlewareClass)
        const response = await middleware.handle(ctx, currentNext)
        if (response instanceof Response) {
          earlyResponse = response
        }
      }
    }

    // Execute the chain
    await chain()

    return earlyResponse
  }

  /**
   * Join a base path and a route path, normalizing slashes
   */
  private joinPaths(basePath: string, routePath: string): string {
    if (routePath === '/' || routePath === '') return basePath
    if (basePath !== '/' && basePath.endsWith('/')) basePath = basePath.slice(0, -1)
    if (routePath && !routePath.startsWith('/')) routePath = '/' + routePath
    return basePath + routePath
  }
}
