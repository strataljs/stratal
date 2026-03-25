import type { Context, MiddlewareHandler } from 'hono'
import type { UpgradeWebSocket, WSContext, WSEvents } from 'hono/ws'
import { type Container, getMethodInjections } from '../../di'
import {
  type Guard,
  getControllerGuards,
  getMethodGuards,
  GuardExecutionService,
} from '../../guards'
import type { OpenAPIHono } from '../../i18n/validation'
import { createRoute, z } from '../../i18n/validation'
import { type LoggerService } from '../../logger'
import type { Constructor } from '../../types'
import { getWsOnCloseMethod, getWsOnErrorMethod, getWsOnMessageMethod, isGateway } from '../../websocket/decorators'
import { GatewayContext } from '../../websocket/gateway-context'
import { DEFAULT_CONTENT_TYPE, HTTP_METHODS, METHOD_STATUS_CODES, SECURITY_SCHEMES, VERSION_NEUTRAL } from '../constants'
import type { IController } from '../controller'
import {
  getControllerOptions,
  getControllerRoute,
  getRouteDecoratedMethods,
  getRouteMetadata,
} from '../decorators'
import {
  ControllerMethodNotFoundError,
  ControllerRegistrationError,
  OpenAPIRouteRegistrationError,
} from '../errors'
import { RouterContext } from '../router-context'
import { commonErrorSchemas } from '../schemas/common.schemas'
import type {
  ControllerOptions,
  HttpMethod,
  OpenAPIRouteConfig,
  RouteBodyObject,
  RouteConfig,
  RouteMetadata,
  RouterEnv,
  SecuritySchemeRecord,
  VersioningOptions,
} from '../types'

const invokeHandler = (instance: Record<string, (...args: unknown[]) => unknown>, method: string, ...args: unknown[]): Promise<unknown> => {
  try {
    return Promise.resolve(instance[method](...args))
  } catch (err: unknown) {
    return Promise.reject(err as Error)
  }
}

/**
 * Route registration service
 * Manages controller and route registration with OpenAPI support
 *
 * Responsibilities:
 * - Register RESTful controllers with OpenAPI metadata
 * - Auto-derive HTTP methods/paths from controller method names
 * - Build OpenAPI route configurations with guard execution
 * - Validate all controllers have access decorators (strict mode)
 * - Create controller handlers with DI resolution
 */
export class RouteRegistrationService {
  private controllerClasses = new Map<string, Constructor<IController>>()
  private upgradeWebSocketFn: UpgradeWebSocket | null = null

  /** Raw locale codes for path-based detection (e.g., ['en', 'fr']) */
  private readonly localePathPrefixes: string[] | null

  constructor(
    private logger: LoggerService,
    private versioningOptions: VersioningOptions | null = null,
    localePathPrefixes: string[] | null = null,
  ) {
    this.localePathPrefixes = localePathPrefixes
  }

  /**
   * Configure router with controllers
   *
   * @param app - OpenAPIHono application instance
   * @param controllers - Array of controller classes from modules
   */
  async configure(
    app: OpenAPIHono<RouterEnv>,
    controllers: Constructor<IController>[]
  ): Promise<void> {
    this.logger.info('Registering controllers', {
      controllerCount: controllers.length,
    })

    // Sort controllers: specific routes first, wildcard handlers last
    // This ensures more specific routes are matched before catch-all wildcards
    // (e.g., /api/v1/auth/magic-link matches before /api/v1/auth/:path{.+})
    const sortedControllers = [...controllers].sort((a, b) => {
      const aHasHandle = 'handle' in a.prototype
      const bHasHandle = 'handle' in b.prototype
      if (aHasHandle && !bHasHandle) return 1  // a goes after b
      if (!aHasHandle && bHasHandle) return -1 // a goes before b
      return 0 // maintain relative order
    })

    // Eagerly load upgradeWebSocket once if any gateway exists
    if (sortedControllers.some(isGateway)) {
      const { upgradeWebSocket } = await import('hono/cloudflare-workers')
      this.upgradeWebSocketFn = upgradeWebSocket
    }

    for (const ControllerClass of sortedControllers) {
      this.registerEntry(app, ControllerClass)
    }

    this.logger.info('Controller registration complete')
  }

  /**
   * Unified entry point for registering a controller or gateway.
   * Resolves route, versioning, and guards, then delegates to the appropriate handler.
   */
  private registerEntry(app: OpenAPIHono<RouterEnv>, ControllerClass: Constructor<IController>): void {
    const isWsGateway = isGateway(ControllerClass)
    const route = getControllerRoute(ControllerClass)

    if (!route) {
      throw new ControllerRegistrationError(
        ControllerClass.name,
        isWsGateway
          ? 'Missing @Gateway decorator or route metadata'
          : 'Missing @Controller decorator or route metadata'
      )
    }

    const controllerOpts = getControllerOptions(ControllerClass)
    const controllerGuards = getControllerGuards(ControllerClass)?.guards ?? []
    const resolvedPaths = this.resolveVersionedPaths(route, controllerOpts)

    // WebSocket gateway — register as GET with upgradeWebSocket
    if (isWsGateway) {
      for (const { path: fullPath } of resolvedPaths) {
        this.registerGatewayForPath(app, ControllerClass, fullPath, controllerGuards)
      }
      return
    }

    const className = ControllerClass.name
    this.controllerClasses.set(className, ControllerClass)

    const prototype = ControllerClass.prototype as IController

    // Wildcard routes (non-RESTful controllers with handle())
    if (prototype.handle) {
      for (const { path: fullPath } of resolvedPaths) {
        this.registerWildcardRoute(app, ControllerClass, fullPath)
      }
      return
    }

    // Standard HTTP routes — validate decorated methods
    const decoratedMethods = getRouteDecoratedMethods(ControllerClass)

    if (decoratedMethods.length === 0) {
      throw new ControllerRegistrationError(
        ControllerClass.name,
        'No route decorators found. Use @Route() or HTTP method decorators (@Get, @Post, etc.) on controller methods.'
      )
    }

    // Enforce mutual exclusivity: no mixing @Route() with @Get/@Post/etc.
    const proto = ControllerClass.prototype as IController
    const types = new Set(decoratedMethods.map(m => getRouteMetadata(proto, m)?.type))
    if (types.has('convention') && types.has('explicit')) {
      throw new ControllerRegistrationError(
        ControllerClass.name,
        'Cannot mix @Route() with HTTP method decorators (@Get, @Post, etc.) in the same controller. Use one pattern or the other.'
      )
    }

    for (const { path: fullPath, hideFromDocs: forceHide } of resolvedPaths) {
      this.registerRoutes(app, ControllerClass, fullPath, decoratedMethods, controllerOpts, forceHide)
    }
  }

  /**
   * Register a single WebSocket gateway route
   */
  private registerGatewayForPath(
    app: OpenAPIHono<RouterEnv>,
    GatewayClass: Constructor<IController>,
    fullPath: string,
    guards: Guard[]
  ): void {
    // Cache WS metadata once at registration time (not per-connection)
    const onMsgMethod = getWsOnMessageMethod(GatewayClass)
    const onCloseMethod = getWsOnCloseMethod(GatewayClass)
    const onErrMethod = getWsOnErrorMethod(GatewayClass)

    const wsHandler: MiddlewareHandler<RouterEnv> = this.upgradeWebSocketFn!((c) => {
      const routerCtx = new RouterContext(c as Context<RouterEnv>)
      const container = routerCtx.getContainer()
      const gateway = container.resolve(GatewayClass)

      // Cloudflare Workers doesn't support the `onOpen` WebSocket event;
      // the upgrade callback itself serves as the open context.
      const events: Omit<WSEvents, 'onOpen'> = {}

      const bindWsHandler = (
        method: string,
        onCatch?: (err: unknown, ws: WSContext) => void
      ) => {
        return (evt: MessageEvent | CloseEvent | Event, ws: WSContext) => {
          const ctx = new GatewayContext(c as Context<RouterEnv>, ws)
          invokeHandler(gateway as Record<string, (...args: unknown[]) => unknown>, method, evt, ctx).catch((err: unknown) => {
            this.logger.error(`WebSocket ${method} handler error`, { gateway: GatewayClass.name, error: err instanceof Error ? err.message : String(err) })
            onCatch?.(err, ws)
          })
        }
      }

      if (onMsgMethod) {
        events.onMessage = bindWsHandler(onMsgMethod, (_err, ws) => ws.close(1011, 'Internal Error'))
      }
      if (onCloseMethod) {
        events.onClose = bindWsHandler(onCloseMethod)
      }
      if (onErrMethod) {
        events.onError = bindWsHandler(onErrMethod)
      }

      return events
    }) as MiddlewareHandler<RouterEnv>

    this.nameHandler(wsHandler, GatewayClass.name, onMsgMethod ?? '[anonymous]', 'ws')

    this.logger.info('Registering WebSocket gateway', {
      gateway: GatewayClass.name,
      path: fullPath,
    })

    const handlers: MiddlewareHandler<RouterEnv>[] = []

    if (guards.length > 0) {
      this.logger.info('Gateway guards', {
        gateway: GatewayClass.name,
        path: fullPath,
        guardCount: guards.length,
      })
      handlers.push(this.createGuardMiddleware(guards))
    }

    handlers.push(wsHandler)

    // Type assertion needed because Hono's overloaded .get() signatures
    // don't accept a spread of MiddlewareHandler[] alongside upgradeWebSocket's output type
    app.get(fullPath, ...(handlers as [MiddlewareHandler<RouterEnv>]))
  }

  /**
   * Resolve versioned paths for a controller based on versioning configuration.
   *
   * @param basePath - The base path from @Controller decorator
   * @param controllerOpts - Controller options (may contain version)
   * @returns Array of resolved paths (with version prefix if applicable)
   */
  private resolveVersionedPaths(basePath: string, controllerOpts?: ControllerOptions): { path: string; hideFromDocs: boolean }[] {
    let paths: string[]

    // Versioning disabled — always return base path
    if (!this.versioningOptions) {
      paths = [basePath]
    } else {
      const version = controllerOpts?.version

      // VERSION_NEUTRAL — explicitly opt out of versioning
      if (version === VERSION_NEUTRAL) {
        paths = [basePath]
      } else {
        const prefix = this.versioningOptions.prefix ?? 'v'

        // Explicit version(s) on the controller
        if (version !== undefined) {
          const versions = Array.isArray(version) ? version : [version]
          paths = versions.map(v => `/${prefix}${v}${basePath}`)
        } else if (this.versioningOptions.defaultVersion !== undefined) {
          // No explicit version — apply defaultVersion if set
          const defaults = Array.isArray(this.versioningOptions.defaultVersion)
            ? this.versioningOptions.defaultVersion
            : [this.versioningOptions.defaultVersion]
          paths = defaults.map(v => `/${prefix}${v}${basePath}`)
        } else {
          // Versioning enabled but no version and no default — no prefix
          paths = [basePath]
        }
      }
    }

    if (this.localePathPrefixes) {
      return paths.map(p => ({ path: `/{locale}${p}`, hideFromDocs: false }))
    }

    return paths.map(p => ({ path: p, hideFromDocs: false }))
  }

  /**
   * Create a guard execution middleware
   *
   * This middleware executes all guards for a route before the handler.
   * Guards are executed in order; all must pass for the request to proceed.
   *
   * @param guards - Array of guards to execute
   * @returns Hono middleware function
   */
  private createGuardMiddleware(guards: Guard[]) {
    const guardService = new GuardExecutionService(this.logger)

    return async (c: Context<RouterEnv>, next: () => Promise<void>) => {
      const ctx = new RouterContext(c)
      const container = ctx.getContainer()

      // Execute all guards - throws on failure
      await guardService.executeGuards(guards, ctx, container)

      // All guards passed, continue to handler
      await next()
    }
  }

  /**
   * Register wildcard route for non-RESTful controllers
   */
  private registerWildcardRoute(
    app: OpenAPIHono<RouterEnv>,
    ControllerClass: Constructor<IController>,
    route: string
  ): void {
    this.logger.info(`Registering wildcard route`, {
      controller: ControllerClass.name,
      route: `${route}/:path{.+}`,
      method: 'ALL',
    })

    const handler = this.createControllerHandler(ControllerClass, 'handle')
    // Match base route exactly
    app.all(route, handler)
    // Match all sub-paths using named regex wildcard
    app.all(`${route}/:path{.+}`, handler)
  }

  /**
   * Register routes for a controller using unified route metadata.
   * Handles both convention-based (@Route) and explicit (@Get, @Post, etc.) routes.
   * @All routes are registered without OpenAPI; all others go through OpenAPI with optional `hide`.
   */
  private registerRoutes(
    app: OpenAPIHono<RouterEnv>,
    ControllerClass: Constructor<IController>,
    basePath: string,
    decoratedMethods: string[],
    controllerOpts: ControllerOptions | undefined,
    forceHideFromDocs = false,
  ): void {
    const className = ControllerClass.name
    const prototype = ControllerClass.prototype as IController
    const controllerHidden = forceHideFromDocs || (controllerOpts?.hideFromDocs ?? false)
    const controllerGuards = getControllerGuards(ControllerClass)?.guards ?? []

    // Pre-resolve all methods and sort by path specificity (static before dynamic)
    // This ensures /notes/create registers before /notes/:id regardless of declaration order
    const resolvedMethods = decoratedMethods
      .map(methodName => {
        const meta = getRouteMetadata(prototype, methodName)
        if (!meta) return null
        const resolved = this.resolveMethodAndPath(meta, methodName, basePath, className)
        if (!resolved) return null
        return { methodName, meta, resolved }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => {
        const scoreA = this.getPathSpecificityScore(a.resolved.fullPath)
        const scoreB = this.getPathSpecificityScore(b.resolved.fullPath)
        if (scoreA !== scoreB) return scoreA - scoreB
        // Tie-break: more segments = more specific path, register first
        const segA = a.resolved.fullPath.split('/').filter(Boolean).length
        const segB = b.resolved.fullPath.split('/').filter(Boolean).length
        return segB - segA
      })

    for (const { methodName, meta, resolved } of resolvedMethods) {
      const { httpMethod, fullPath, routeConfig, statusCodeOverride } = resolved
      const hideFromDocs = routeConfig.hideFromDocs ?? controllerHidden

      // Collect guards (controller + method)
      const methodGuards = getMethodGuards(prototype, methodName)?.guards ?? []
      const allGuards: Guard[] = [...controllerGuards, ...methodGuards]

      if (allGuards.length > 0) {
        this.logger.info(`Route guards`, {
          controller: className,
          method: httpMethod.toUpperCase(),
          path: fullPath,
          methodName,
          guardCount: allGuards.length,
        })
      }

      const handler = this.createControllerHandler(ControllerClass, methodName)

      // @All routes can't use OpenAPI — register directly with guards
      if (httpMethod === 'all') {
        this.logger.info(`Registering @All route`, {
          controller: className,
          path: fullPath,
          methodName,
        })

        if (allGuards.length > 0) {
          app.all(fullPath, this.createGuardMiddleware(allGuards), handler)
        } else {
          app.all(fullPath, handler)
        }
        continue
      }

      // Build and register OpenAPI route (with optional hide for docs exclusion)
      const metadata = this.mergeMetadata(controllerOpts, routeConfig, ControllerClass, methodName)
      const openApiRoute = this.buildOpenAPIRoute(
        httpMethod,
        fullPath,
        routeConfig,
        metadata,
        allGuards,
        hideFromDocs,
        meta.type === 'convention' ? methodName : undefined,
        statusCodeOverride,
      )

      this.logger.info(`Registering route`, {
        controller: className,
        method: httpMethod.toUpperCase(),
        path: fullPath,
        methodName,
        tags: metadata.tags,
        hidden: hideFromDocs,
      })

      app.openapi(openApiRoute, handler)
    }
  }

  /**
   * Resolve HTTP method, path, route config, and status code from route metadata.
   */
  private resolveMethodAndPath(
    meta: RouteMetadata,
    methodName: string,
    basePath: string,
    className: string
  ): { httpMethod: HttpMethod; fullPath: string; routeConfig: RouteConfig; statusCodeOverride?: number } | null {
    if (meta.type === 'convention') {
      const derived = this.deriveHttpMethodAndPath(methodName, basePath)
      if (!derived) {
        throw new ControllerRegistrationError(
          `Cannot derive HTTP method/path for convention-based route "${className}.${methodName}". ` +
          `Ensure the method name follows the naming convention (e.g., index, create, show).`
        )
      }
      return { httpMethod: derived.method, fullPath: derived.path, routeConfig: meta.config, statusCodeOverride: meta.config.statusCode }
    }

    return {
      httpMethod: meta.method,
      fullPath: this.joinPaths(basePath, meta.path),
      routeConfig: meta.config,
      statusCodeOverride: meta.config.statusCode,
    }
  }

  /**
   * Join a base path and a route path, normalizing slashes
   */
  private joinPaths(basePath: string, routePath: string): string {
    if (routePath === '/') return basePath
    if (basePath !== '/' && basePath.endsWith('/')) basePath = basePath.slice(0, -1)
    if (routePath && !routePath.startsWith('/')) routePath = '/' + routePath
    return basePath + routePath
  }

  /**
   * Compute a specificity score for route path sorting.
   * Lower score = higher priority (registered first).
   * Static paths < parameterized paths < wildcard paths.
   */
  private getPathSpecificityScore(path: string): number {
    const segments = path.split('/').filter(Boolean)
    let score = 0
    for (const segment of segments) {
      if (segment.includes('{.+}') || segment.includes('{.*}')) {
        score += 100
      } else if (segment.startsWith(':')) {
        score += 10
      }
    }
    return score
  }


  /**
   * Auto-derive HTTP method and path from controller method name
   * Uses HTTP_METHODS constant for RESTful convention mapping
   */
  private deriveHttpMethodAndPath(methodName: string, basePath: string): { method: Exclude<HttpMethod, 'all'>; path: string } | null {
    if (!(methodName in HTTP_METHODS)) return null
    const mapping = HTTP_METHODS[methodName as keyof typeof HTTP_METHODS]

    return {
      method: mapping.method as Exclude<HttpMethod, 'all'>,
      path: basePath + mapping.path,
    }
  }

  /**
   * Merge controller-level and route-level metadata
   * Tags are merged (appended), security is merged (union)
   * Guards automatically add sessionCookie security if present
   */
  private mergeMetadata(
    controllerOpts: ControllerOptions | undefined,
    routeConfig: RouteConfig,
    ControllerClass: Constructor<IController>,
    methodName: string
  ): { tags: string[]; security: SecuritySchemeRecord[] } {
    const tags = [...(controllerOpts?.tags ?? []), ...(routeConfig.tags ?? [])]

    // Check if guards are present (indicates authentication is required)
    const prototype = ControllerClass.prototype as IController
    const hasMethodGuards = (getMethodGuards(prototype, methodName)?.guards.length ?? 0) > 0
    const hasControllerGuards = (getControllerGuards(ControllerClass)?.guards.length ?? 0) > 0
    const requiresAuth = hasMethodGuards || hasControllerGuards

    // Merge security: if route explicitly sets security (even empty array), use it
    // Otherwise inherit from controller
    let security: string[] = []
    if (routeConfig.security !== undefined) {
      // Route has explicit security (could be empty for public routes)
      security = [...(controllerOpts?.security ?? []), ...routeConfig.security]
    } else if (controllerOpts?.security) {
      // Inherit controller security
      security = controllerOpts.security
    }

    // Auto-add sessionCookie security if guards are present
    if (requiresAuth && !security.includes(SECURITY_SCHEMES.SESSION_COOKIE)) {
      security.push(SECURITY_SCHEMES.SESSION_COOKIE)
    }

    // Convert security array to OpenAPI security format
    const securityArray: SecuritySchemeRecord[] =
      security.length > 0
        ? (security.map<SecuritySchemeRecord>((scheme) => ({ [scheme]: [] }) as unknown as SecuritySchemeRecord))
        : ([] as SecuritySchemeRecord[])

    return { tags, security: securityArray }
  }

  /**
   * Build OpenAPI route configuration from metadata
   * Creates a route definition compatible with @hono/zod-openapi
   * Includes guard execution for proper access control
   *
   * Execution order: Global middlewares → Guards → Handler
   */
  private buildOpenAPIRoute(
    method: Exclude<HttpMethod, 'all'>,
    path: string,
    routeConfig: RouteConfig,
    metadata: { tags: string[]; security: Record<string, string[]>[] },
    guards: Guard[],
    hideFromDocs: boolean,
    methodName?: string,
    statusCodeOverride?: number
  ): OpenAPIRouteConfig {
    try {
      const route: Partial<OpenAPIRouteConfig> & { hide?: boolean } = {
        method,
        path,
        request: {},
        responses: {},
      }

      // Hide from OpenAPI docs while keeping validation active
      if (hideFromDocs) {
        route.hide = true
      }

      // Add guard execution middleware using Hono's built-in middleware property
      if (guards.length > 0) {
        route.middleware = [this.createGuardMiddleware(guards)]
      }

      // Add request body if defined
      if (routeConfig.body) {
        const bodySchema = this.isRouteBodyObject(routeConfig.body) ? routeConfig.body.schema : routeConfig.body
        const bodyContentType = this.isRouteBodyObject(routeConfig.body) ? routeConfig.body.contentType ?? DEFAULT_CONTENT_TYPE : DEFAULT_CONTENT_TYPE

        route.request = {
          ...route.request,
          body: {
            content: {
              [bodyContentType]: {
                schema: bodySchema,
              },
            },
          },
        }
      }

      // Add query parameters if defined
      if (routeConfig.query) {
        route.request = {
          ...route.request,
          query: routeConfig.query,
        }
      }

      // Add URL parameters if defined
      if (routeConfig.params) {
        route.request = {
          ...route.request,
          params: routeConfig.params,
        }
      }

      // Auto-inject locale path parameter when path-based i18n is enabled
      if (this.localePathPrefixes) {
        const localeParam = z.object({
          locale: z.enum(this.localePathPrefixes as [string, ...string[]]).openapi({
            param: {
              name: 'locale',
              in: 'path',
            },
          }),
        })

        route.request = {
          ...route.request,
          params: route.request!.params
            ? (route.request!.params as z.ZodObject<z.ZodRawShape>).extend(localeParam.shape)
            : localeParam,
        }
      }

      // Derive success status code from method name or use override
      const successStatus = statusCodeOverride
        ?? (methodName && METHOD_STATUS_CODES[methodName as keyof typeof METHOD_STATUS_CODES])
        ?? 200

      // Build responses object with auto-derived status
      const responses: NonNullable<OpenAPIRouteConfig['responses']> = {}

      // Add success response with derived status code
      const responseDef = routeConfig.response
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- response may be undefined at runtime
      if (responseDef) {
        if (typeof responseDef === 'object' && 'schema' in responseDef) {
          const responseContentType = responseDef.contentType ?? DEFAULT_CONTENT_TYPE
          responses[successStatus] = {
            content: {
              [responseContentType]: { schema: responseDef.schema },
            },
            description: responseDef.description ?? `Response ${successStatus}`,
          }
        } else {
          responses[successStatus] = {
            content: {
              [DEFAULT_CONTENT_TYPE]: { schema: responseDef },
            },
            description: `Response ${successStatus}`,
          }
        }
      }

      // Auto-merge common error schemas (400, 401, 403, 404, 409, 500)
      // Controllers only need to define success response; error responses are added automatically
      for (const [statusStr, schema] of Object.entries(commonErrorSchemas)) {
        const status = parseInt(statusStr)
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: avoid overwriting success response status
        responses[status] ??= schema
      }

      route.responses = responses

      // Add tags if provided
      if (metadata.tags.length > 0) {
        route.tags = metadata.tags
      }

      // Add security if provided
      if (metadata.security.length > 0) {
        route.security = metadata.security
      }

      // Add description and summary
      if (routeConfig.description) {
        route.description = routeConfig.description
      }
      if (routeConfig.summary) {
        route.summary = routeConfig.summary
      }

      return createRoute(route as OpenAPIRouteConfig)
    } catch (error) {
      throw new OpenAPIRouteRegistrationError(path, error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * Check if a body definition is a RouteBodyObject (has schema key) vs bare ZodType
   */
  private isRouteBodyObject(body: RouteConfig['body']): body is RouteBodyObject {
    return typeof body === 'object' && 'schema' in body
  }

  /**
   * Resolve method parameter injections from the container
   *
   * @param prototype - Controller prototype
   * @param methodName - Method name to get injections for
   * @param container - Request-scoped container
   * @returns Array of resolved dependencies in parameter order
   */
  private resolveMethodInjections(
    prototype: object,
    methodName: string,
    container: Container
  ): unknown[] {
    const injections = getMethodInjections(prototype, methodName)
    if (!injections.length) return []

    return injections.map((inj): unknown => container.resolve(inj.token))
  }

  /**
   * Name a handler function so Hono's inspectRoutes() can identify it.
   * Format: `{type}:{Controller}.{method}` (e.g. `http:UsersController.create`)
   */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- intentionally accepting any function to set its name
  private nameHandler(fn: Function, controller: string, method: string, type: 'http' | 'ws' = 'http'): void {
    Object.defineProperty(fn, 'name', { value: `${type}:${controller}.${method}` })
  }

  /**
   * Create controller handler that resolves controller from request-scoped container
   * This ensures each request gets a fresh controller with request-scoped context
   */
  private createControllerHandler(
    ControllerClass: new (...args: unknown[]) => IController,
    methodName: string
  ): (c: Context<RouterEnv>) => Promise<Response> {
    const handler = async (c: Context<RouterEnv>) => {
      const ctx = new RouterContext(c)
      const requestContainer = ctx.getContainer()
      const controller = requestContainer.resolve<IController>(ControllerClass)

      const method = controller[methodName as keyof IController]
      if (typeof method === 'function') {
        const injectedArgs = this.resolveMethodInjections(ControllerClass.prototype as object, methodName, requestContainer)
        return await (method as (...args: unknown[]) => Promise<Response>).apply(controller, [ctx, ...injectedArgs])
      }

      throw new ControllerMethodNotFoundError(methodName, ControllerClass.name)
    }

    this.nameHandler(handler, ControllerClass.name, methodName)
    return handler
  }
}
