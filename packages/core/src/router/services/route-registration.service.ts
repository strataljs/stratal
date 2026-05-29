import type { Context, MiddlewareHandler } from 'hono';
import type { UpgradeWebSocket, WSContext, WSEvents } from 'hono/ws';
import { type Container, getMethodInjections, inject } from '../../di';
import { Singleton } from '../../di/decorators';
import { DI_TOKENS } from '../../di/tokens';
import {
    type Guard,
    GuardExecutionService,
    getControllerGuards,
    getMethodGuards,
} from '../../guards';
import type { ZodType } from '../../i18n/validation/zod';
import { createRoute, z } from '../../i18n/validation/zod';
import { LOGGER_TOKENS, type LoggerService } from '../../logger';
import type { ModuleRegistry } from '../../module/module-registry';
import { getRateLimits } from '../../rate-limiter/decorators/rate-limit.decorator';
import { createThrottleMiddleware } from '../../rate-limiter/throttle.middleware';
import type { Constructor } from '../../types';
import { getWsOnCloseMethod, getWsOnErrorMethod, getWsOnMessageMethod, isGateway } from '../../websocket/decorators';
import { GatewayContext } from '../../websocket/gateway-context';
import { DEFAULT_CONTENT_TYPE, HTTP_METHODS, METHOD_STATUS_CODES, SECURITY_SCHEMES } from '../constants';
import type { IController } from '../controller';
import {
    getControllerOptions,
    getControllerRoute,
    getRouteDecoratedMethods,
    getRouteMetadata,
} from '../decorators';
import {
    ResponseValidationError,
} from '../errors';
import type { HonoApp } from '../hono-app';
import type { Middleware } from '../middleware.interface';
import { createDomainMiddleware } from '../middleware/domain.middleware';
import { createMiddlewareChain } from '../middleware/middleware-chain';
import { type RegisteredRoute, type RouteRegistry } from '../route-registry';
import { RouterContext } from '../router-context';
import type { RouterResolver } from '../router-resolver';
import { RouterError } from '../router.error';
import { ROUTER_TOKENS } from '../router.tokens';
import { commonErrorSchemas } from '../schemas/common.schemas';
import type {
    ControllerOptions,
    HttpMethod,
    OpenAPIRouteConfig,
    RouteBodyObject,
    RouteConfig,
    RouteMetadata,
    RouteResponseObject,
    RouterEnv,
    SecuritySchemeRecord,
} from '../types';
import { toOpenAPIPath, toRoutingOpenAPIPath } from '../utils/path';
import { generateConventionRouteName } from '../utils/route-name';
import type { LocalePathService } from './locale-path.service';

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
 *
 * Two-pass strategy:
 * 1. Collect: iterate controllers, register in RouteRegistry, store Hono actions
 * 2. Register: iterate registry.all() (sorted), execute stored actions in Hono
 */
@Singleton()
export class RouteRegistrationService {
  private controllerClasses = new Map<string, Constructor>()
  private upgradeWebSocketFn: UpgradeWebSocket | null = null

  constructor(
    @inject(LOGGER_TOKENS.LoggerService) private logger: LoggerService,
    @inject(ROUTER_TOKENS.RouteRegistry) private registry: RouteRegistry,
    @inject(ROUTER_TOKENS.RouterResolver, { isOptional: true }) private routerResolver: RouterResolver | null,
    @inject(ROUTER_TOKENS.LocalePathService) private localePathService: LocalePathService,
    @inject(ROUTER_TOKENS.HonoApp) private app: HonoApp,
    @inject(DI_TOKENS.ModuleRegistry) private moduleRegistry: ModuleRegistry,
  ) { }

  /**
   * Configure router with controllers and global middleware.
   * Resolves controllers from ModuleRegistry and global middleware from RouterResolver.
   */
  async configure(): Promise<void> {
    const controllers = this.moduleRegistry.getAllControllers()
    const globalMiddleware = this.routerResolver?.getGlobalMiddleware() ?? []

    this.logger.info('Registering controllers', {
      controllerCount: controllers.length,
    })

    // Global middleware from Router.use() (applies to ALL routes)
    if (globalMiddleware.length > 0) {
      this.app.use('*', createMiddlewareChain(globalMiddleware))
    }

    // Eagerly load upgradeWebSocket once if any gateway exists
    if (controllers.some(isGateway)) {
      const { upgradeWebSocket } = await import('hono/cloudflare-workers')
      this.upgradeWebSocketFn = upgradeWebSocket
    }

    // Pass 1: Collect routes into registry + store Hono registration actions
    const actions = new WeakMap<RegisteredRoute, () => void>()
    for (const ControllerClass of controllers) {
      this.collectRoutes(ControllerClass, actions)
    }

    // Pass 2: Register in Hono in specificity order from registry
    for (const route of this.registry.all()) {
      actions.get(route)?.()
    }

    this.logger.info('Controller registration complete')
  }

  /**
   * Pass 1: Collect routes from a controller into RouteRegistry and store Hono actions.
   * Versioning and locale expansion are handled by RouteRegistry.register().
   */
  private collectRoutes(
    ControllerClass: Constructor,
    actions: WeakMap<RegisteredRoute, () => void>,
  ): void {
    const isWsGateway = isGateway(ControllerClass)
    const controllerRoute = getControllerRoute(ControllerClass)

    if (!controllerRoute) {
      throw new RouterError(
        `Controller "${ControllerClass.name}" registration failed: ${isWsGateway
          ? 'Missing @Gateway decorator or route metadata'
          : 'Missing @Controller decorator or route metadata'}`
      )
    }

    const controllerOpts = getControllerOptions(ControllerClass)
    const controllerGuards = getControllerGuards(ControllerClass)?.guards ?? []

    // Resolve Router config for this controller (prefix, domain, name, middleware, version, hideFromDocs)
    const routerConfig = this.routerResolver?.resolveForController(ControllerClass) ?? { middleware: [] }

    // Class-level @RateLimit decorators — same for every method on this controller.
    // Throttle middleware classes are memoized by name in createThrottleMiddleware,
    // so two `@RateLimit('a')` decorators yield the same class — Set dedupes them.
    const classThrottleMiddleware = Array.from(
      new Set(getRateLimits(ControllerClass).map(createThrottleMiddleware)),
    )

    // Apply Router prefix to controller base path
    const basePath = routerConfig.prefix
      ? this.joinPaths(routerConfig.prefix, controllerRoute)
      : controllerRoute

    // Version resolution: controller version > Router version
    const effectiveVersion = controllerOpts?.version ?? routerConfig.version

    // Apply domain middleware if controller or router has a domain pattern
    const effectiveDomain = controllerOpts?.domain ?? routerConfig.domain

    // WebSocket gateway
    if (isWsGateway) {
      // Class-level @RateLimit applies; methods on a gateway aren't decorated routes.
      const wsMiddleware = [...routerConfig.middleware, ...classThrottleMiddleware]
      const expandedRoutes = this.registry.register({
        method: 'ws',
        basePath,
        version: effectiveVersion,
        domain: effectiveDomain,
        controller: ControllerClass.name,
        action: 'ws',
        hidden: routerConfig.hideFromDocs ?? false,
        middleware: wsMiddleware.map(m => m.name),
      })

      for (const route of expandedRoutes) {
        actions.set(route, () => {
          // Apply scoped middleware at the exact route path so it runs
          // for this specific route (including the root of the group) —
          // not via a `/*` sub-path wildcard, which would miss the exact
          // path match.
          if (wsMiddleware.length > 0) {
            this.app.use(route.path, createMiddlewareChain(wsMiddleware))
          }
          // Apply domain middleware
          if (effectiveDomain) {
            const domainHandler = createDomainMiddleware(effectiveDomain)
            this.app.use(route.path, domainHandler)
            this.app.use(`${route.path}/*`, domainHandler)
          }
          this.registerGatewayForPath(ControllerClass, route.path, controllerGuards)
        })
      }
      return
    }

    const className = ControllerClass.name
    this.controllerClasses.set(className, ControllerClass)

    const prototype = ControllerClass.prototype as IController

    // Wildcard routes (non-RESTful controllers with handle())
    if (prototype.handle) {
      // No method-level @RateLimit on wildcard handle() — only class-level applies.
      const wildcardMiddleware = [...routerConfig.middleware, ...classThrottleMiddleware]
      const expandedRoutes = this.registry.register({
        method: 'all',
        basePath,
        version: effectiveVersion,
        domain: effectiveDomain,
        controller: className,
        action: 'handle',
        hidden: routerConfig.hideFromDocs ?? false,
        middleware: wildcardMiddleware.map(m => m.name),
      })

      for (const route of expandedRoutes) {
        actions.set(route, () => {
          if (wildcardMiddleware.length > 0) {
            this.app.use(route.path, createMiddlewareChain(wildcardMiddleware))
          }
          this.registerWildcardRoute(ControllerClass, route.path)
        })
      }
      return
    }

    // Standard HTTP routes — validate decorated methods
    const decoratedMethods = getRouteDecoratedMethods(ControllerClass)

    if (decoratedMethods.length === 0) {
      throw new RouterError(
        `Controller "${ControllerClass.name}" registration failed: No route decorators found. Use @Route() or HTTP method decorators (@Get, @Post, etc.) on controller methods.`
      )
    }

    // Pre-cache metadata for all decorated methods (avoids double getRouteMetadata lookup)
    const methodMetadata: { method: string; meta: RouteMetadata }[] = []
    let hasConvention = false
    let hasExplicit = false
    for (const m of decoratedMethods) {
      const meta = getRouteMetadata(prototype, m)
      if (!meta) continue
      methodMetadata.push({ method: m, meta })
      if (meta.type === 'convention') hasConvention = true
      else if (meta.type === 'explicit') hasExplicit = true
    }

    // Enforce mutual exclusivity: no mixing @Route() with @Get/@Post/etc.
    if (hasConvention && hasExplicit) {
      throw new RouterError(
        `Controller "${ControllerClass.name}" registration failed: Cannot mix @Route() with HTTP method decorators (@Get, @Post, etc.) in the same controller. Use one pattern or the other.`
      )
    }

    const routerHidden = routerConfig.hideFromDocs
    const controllerHidden = controllerOpts?.hideFromDocs ?? false

    // Resolve effective name prefix: router-level name (module + group merged by
    // RouterResolver) concatenates with the controller-level name, mirroring how
    // prefixes compose. A controller's `{ name: 'dashboard.' }` inside a module
    // that calls `router.name('admin.')` becomes `admin.dashboard.*` — not
    // `dashboard.*`.
    const routerName = routerConfig.name
    const controllerName = controllerOpts?.name
    const effectiveNamePrefix =
      routerName && controllerName
        ? `${routerName}${controllerName}`
        : (routerName ?? controllerName)

    for (const { method: methodName, meta } of methodMetadata) {
      const resolved = this.resolveMethodAndPath(meta, methodName, basePath, className)
      if (!resolved) continue

      // Compose per-method middleware: scope (router.throttle/.middleware)
      // → class-level @RateLimit → method-level @RateLimit. Throttle classes
      // are memoized by name, so duplicates across class + method (e.g.
      // `@RateLimit('api')` on both) collapse to a single middleware.
      const methodThrottleMiddleware = getRateLimits(prototype, methodName).map(createThrottleMiddleware)
      const effectiveMiddleware = Array.from(
        new Set([...routerConfig.middleware, ...classThrottleMiddleware, ...methodThrottleMiddleware]),
      )
      const middlewareNames = effectiveMiddleware.map(m => m.name)

      const { httpMethod, fullPath, routeConfig: rawRouteConfig, statusCodeOverride } = resolved

      // Compose prefix params with route-level params WITHOUT mutating the
      // route's metadata — `meta.config` lives on the controller prototype
      // and is shared across every Application/RouteRegistry instance that
      // resolves this controller. Mutating it leaks state across test runs
      // (and any other multi-app setup), causing later registrations to
      // re-extend an already-injected prefix from a previous run.
      let mergedParams = rawRouteConfig.params
      if (routerConfig.params) {
        const prefixShape = (routerConfig.params as z.ZodObject).shape
        mergedParams = mergedParams
          ? (mergedParams as z.ZodObject).extend(prefixShape)
          : (routerConfig.params as z.ZodObject).extend({})
      }
      const routeConfig: RouteConfig = mergedParams === rawRouteConfig.params
        ? rawRouteConfig
        : { ...rawRouteConfig, params: mergedParams }

      const hideFromDocs = routeConfig.hideFromDocs ?? (routerHidden ?? controllerHidden)

      // Compute route name
      let routeName: string | undefined
      if (routeConfig.name) {
        routeName = effectiveNamePrefix ? `${effectiveNamePrefix}${routeConfig.name}` : routeConfig.name
      } else if (meta.type === 'convention') {
        const autoName = generateConventionRouteName(basePath, methodName)
        routeName = effectiveNamePrefix ? `${effectiveNamePrefix}${autoName}` : autoName
      }

      // Register in RouteRegistry (handles versioning + locale expansion)
      const expandedRoutes = this.registry.register({
        name: routeName,
        method: httpMethod,
        basePath: fullPath,
        version: effectiveVersion,
        domain: effectiveDomain,
        controller: className,
        action: methodName,
        hidden: hideFromDocs,
        middleware: middlewareNames,
      })

      // Collect guards — avoid spread when no method-level guards (common case)
      const methodGuards = getMethodGuards(prototype, methodName)?.guards ?? []
      const allGuards: Guard[] = methodGuards.length > 0
        ? [...controllerGuards, ...methodGuards]
        : controllerGuards

      const responseSchema = httpMethod !== 'all'
        ? this.extractResponseSchema(routeConfig)
        : null

      const handler = this.createControllerHandler(ControllerClass, methodName, responseSchema)

      for (const route of expandedRoutes) {
        actions.set(route, () => {
          // Apply domain middleware
          if (effectiveDomain) {
            const domainHandler = createDomainMiddleware(effectiveDomain)
            this.app.use(route.path, domainHandler)
            this.app.use(`${route.path}/*`, domainHandler)
          }

          if (allGuards.length > 0) {
            this.logger.info(`Route guards`, {
              controller: className,
              method: httpMethod.toUpperCase(),
              path: route.path,
              methodName,
              guardCount: allGuards.length,
            })
          }

          // @All routes can't use OpenAPI — register directly with
          // scoped middleware (if any) + guard middleware + handler.
          if (httpMethod === 'all') {
            this.logger.info(`Registering @All route`, {
              controller: className,
              path: route.path,
              methodName,
            })

            if (effectiveMiddleware.length > 0) {
              this.app.use(route.path, createMiddlewareChain(effectiveMiddleware))
            }
            if (allGuards.length > 0) {
              this.app.use(route.path, this.createGuardMiddleware(allGuards))
            }
            this.app.all(route.path, handler)
            return
          }

          // Build and register OpenAPI route
          const metadata = this.mergeMetadata(controllerOpts, routeConfig, ControllerClass, methodName)
          const openApiRoute = this.buildOpenAPIRoute(
            httpMethod,
            route.path,
            routeConfig,
            metadata,
            meta.type === 'convention' ? methodName : undefined,
            statusCodeOverride,
            route.isLocaleVariant ?? false,
          )

          this.logger.info(`Registering route`, {
            controller: className,
            method: httpMethod.toUpperCase(),
            path: route.path,
            methodName,
            tags: metadata.tags,
            hidden: route.hidden,
          })

          // Wrap the controller handler so scoped middleware and guards
          // run AFTER Hono's request validators. @hono/zod-openapi
          // composes a route as `...routeMiddleware, ...validators, handler`
          // (see node_modules/@hono/zod-openapi/dist/index.js), which means
          // anything attached via `route.middleware` runs *before*
          // validation — and therefore can't read `c.req.valid('param')`.
          // Wrapping the handler is the only place we can run middleware
          // after validators in this Hono pipeline.
          //
          // Final order: global app.use → request validators → scoped
          // middleware → guards → controller handler.
          const wrappedHandler = this.wrapHandlerWithChain(handler, effectiveMiddleware, allGuards)
          this.app.openapi(openApiRoute, wrappedHandler)

          // Register clean path in OpenAPI spec (strips regex constraints from params)
          if (!route.hidden) {
            const { hide: _, ...specRoute } = openApiRoute
            this.app.openAPIRegistry.registerPath({
              ...specRoute,
              path: toOpenAPIPath(route.path),
            })
          }
        })
      }
    }
  }


  /**
   * Register a single WebSocket gateway route
   */
  private registerGatewayForPath(
    GatewayClass: Constructor,
    fullPath: string,
    guards: Guard[],
  ): void {
    // Route already registered in RouteRegistry during collectRoutes()
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
            this.logger.error(`WebSocket ${method} handler error`, err as Error, {
              gateway: GatewayClass.name,
            })
            onCatch?.(err, ws)
          })
        }
      }

      if (onMsgMethod) {
        events.onMessage = bindWsHandler(onMsgMethod, (_err, ws) => ws.close(1011, 'Internal Error'))
      }
      if (onCloseMethod) {
        events.onClose = bindWsHandler(onCloseMethod)
      } else {
        // Cloudflare Workers (pre-2026-04-07 compat date) requires the server
        // to complete the WebSocket close handshake explicitly. Without a close
        // listener, Hono never calls server.addEventListener('close', ...),
        // leaving the Worker alive until the runtime kills it with
        // "script will never generate a response".
        events.onClose = (_evt: CloseEvent, ws: WSContext) => {
          ws.close()
        }
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
    this.app.get(fullPath, ...(handlers as [MiddlewareHandler<RouterEnv>]))
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
   * Wrap a controller handler with a `scopedMiddleware → guards → handler`
   * chain that runs *inside* the Hono route handler — after request
   * validators have populated `c.req.valid(...)`. This is the only place
   * we can run user middleware after `@hono/zod-openapi`'s validators in
   * the same pipeline.
   *
   * Returns a Hono handler with the same signature as the original so
   * `app.openapi(route, wrapped)` works transparently.
   */
  private wrapHandlerWithChain(
    handler: (c: Context<RouterEnv>) => Promise<Response>,
    scopedMiddleware: Constructor<Middleware>[],
    guards: Guard[],
  ) {
    if (scopedMiddleware.length === 0 && guards.length === 0) {
      return handler
    }

    const scopedChain = scopedMiddleware.length > 0
      ? createMiddlewareChain(scopedMiddleware)
      : null
    const guardChain = guards.length > 0
      ? this.createGuardMiddleware(guards)
      : null

    return async (c: Context<RouterEnv, string>): Promise<Response> => {
      let captured: Response | undefined

      const runHandler = async () => {
        captured = await handler(c)
      }
      const runGuards = guardChain
        ? () => guardChain(c, runHandler)
        : runHandler
      const runScoped = scopedChain
        ? () => scopedChain(c, runGuards)
        : runGuards

      const result = await runScoped()
      // A middleware (scoped or guard) may short-circuit by returning a
      // Response from its createMiddlewareChain — surface that. Otherwise
      // the handler always sets `captured`.
      if (result instanceof Response) return result
      return captured!
    }
  }

  /**
   * Register wildcard route for non-RESTful controllers
   */
  private registerWildcardRoute(
    ControllerClass: Constructor,
    route: string
  ): void {
    this.logger.info(`Registering wildcard route`, {
      controller: ControllerClass.name,
      route: `${route}/:path{.+}`,
      method: 'ALL',
    })

    const handler = this.createControllerHandler(ControllerClass, 'handle')
    // Match base route exactly
    this.app.all(route, handler)
    // Match all sub-paths using named regex wildcard
    this.app.all(`${route}/:path{.+}`, handler)
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
        throw new RouterError(
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
    if (basePath.endsWith('/')) basePath = basePath.slice(0, -1)
    if (routePath === '/' || routePath === '') return basePath || '/'
    if (!routePath.startsWith('/')) routePath = '/' + routePath
    return basePath + routePath
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
    ControllerClass: Constructor,
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
   * Creates a route definition compatible with @hono/zod-openapi.
   *
   * Scoped middleware and guards are NOT attached to `route.middleware`
   * here — they're composed into a wrapped handler in `collectRoutes` so
   * they run after Hono's request validators. See `wrapHandlerWithChain`.
   */
  private buildOpenAPIRoute(
    method: Exclude<HttpMethod, 'all'>,
    path: string,
    routeConfig: RouteConfig,
    metadata: { tags: string[]; security: Record<string, string[]>[] },
    methodName?: string,
    statusCodeOverride?: number,
    hasLocaleParam = false,
  ): OpenAPIRouteConfig {
    try {
      const route: Partial<OpenAPIRouteConfig> & { hide?: boolean } = {
        method,
        path: toRoutingOpenAPIPath(path),
        request: {},
        responses: {},
        // Always hide from OpenAPI registry — clean paths are registered separately via registerPath()
        hide: true,
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

      // Auto-inject locale path parameter for locale-prefixed routes
      const localeConfig = this.localePathService.localePathConfig
      if (hasLocaleParam && localeConfig) {
        const localeParam = z.object({
          locale: z.enum(localeConfig.prefixedLocales as [string, ...string[]]).openapi({
            param: {
              name: 'locale',
              in: 'path',
            },
          }).optional(),
        })

        route.request = {
          ...route.request,
          params: route.request!.params
            ? (route.request!.params as z.ZodObject).extend(localeParam.shape)
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
      throw new RouterError(`OpenAPI route registration failed for "${path}": ${error instanceof Error ? error.message : String(error)}`)
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
    methodName: string,
    responseSchema: ZodType | null = null,
  ): (c: Context<RouterEnv>) => Promise<Response> {
    const handler = async (c: Context<RouterEnv>) => {
      // Precognition short-circuit: HandlePrecognitiveRequests middleware
      // sets `validationSuccessResponse` for `Precognition: true` requests.
      // If we reach here, every request validator has passed — return the
      // 204 without invoking the controller body.
      const override = c.get('validationSuccessResponse')
      if (override) return override

      const ctx = new RouterContext(c)
      const requestContainer = ctx.getContainer()
      const controller = requestContainer.resolve<IController>(ControllerClass)

      const method = controller[methodName as keyof IController]
      if (typeof method === 'function') {
        const injectedArgs = this.resolveMethodInjections(ControllerClass.prototype as object, methodName, requestContainer)
        const response = await (method as (...args: unknown[]) => Promise<Response>).apply(controller, [ctx, ...injectedArgs])

        if (responseSchema && c.env.ENVIRONMENT !== 'production') {
          return this.validateResponse(response, responseSchema)
        }

        return response
      }

      throw new RouterError(`Method "${methodName}" not found on controller "${ControllerClass.name}"`)
    }

    this.nameHandler(handler, ControllerClass.name, methodName)
    return handler
  }

  /**
   * Extract the Zod schema from a RouteResponse definition.
   * Returns null for non-JSON content types or when no response is defined.
   */
  private extractResponseSchema(routeConfig: RouteConfig): ZodType | null {
    const responseDef = routeConfig.response
    if (!responseDef) return null

    if (this.isRouteResponseObject(responseDef)) {
      const contentType = responseDef.contentType ?? DEFAULT_CONTENT_TYPE
      if (!contentType.includes('application/json')) return null
      return responseDef.schema
    }

    return responseDef
  }

  /**
   * Check if a response definition is a RouteResponseObject (has schema key) vs bare ZodType
   */
  private isRouteResponseObject(response: RouteConfig['response']): response is RouteResponseObject {
    return typeof response === 'object' && 'schema' in response
  }

  /**
   * Validate a Response body against its declared Zod schema.
   *
   * Skips validation for:
   * - Non-JSON content types
   * - Empty bodies (204 No Content, 304 Not Modified)
   *
   * Clones the response to read the body without consuming the original stream.
   */
  private async validateResponse(response: Response, schema: ZodType): Promise<Response> {
    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      return response
    }

    if (response.status === 204 || response.status === 304) {
      return response
    }

    const cloned = response.clone()

    let body: unknown
    try {
      body = await cloned.json()
    } catch {
      return response
    }

    const result = schema.safeParse(body)
    if (!result.success) {
      throw new ResponseValidationError(result.error)
    }

    return response
  }
}
