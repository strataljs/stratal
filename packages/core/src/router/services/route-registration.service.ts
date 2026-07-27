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
import { object } from 'zod/mini';
import type { ZodObject, ZodType } from '../../i18n/validation/zod';
import { LOGGER_TOKENS, type LoggerService } from '../../logger';
import type { ModuleRegistry } from '../../module/module-registry';
import { getRateLimits } from '../../rate-limiter/decorators/rate-limit.decorator';
import { createThrottleMiddleware } from '../../rate-limiter/throttle.middleware';
import { getCacheable, getPurgesCache } from '../../response-cache/decorators';
import { assertCachingAvailable } from '../../response-cache/boot-check';
import { CachePurgeError, ResponseCacheConfigError } from '../../response-cache/errors';
import { RESPONSE_CACHE_TOKENS } from '../../response-cache/response-cache.tokens';
import { bindRouteCache, type RouteCacheBinding } from '../../response-cache/services/route-cache-binding';
import { createLoopbackPurgeTarget } from '../../response-cache/gateway-binding';
import { isGatewayMode } from '../../response-cache/gateway-mode';
import type { GatewayRouteTable } from '../../response-cache/services/gateway-route-table';
import type { PartitionResolverService } from '../../response-cache/services/partition-resolver.service';
import type { CacheabilityService } from '../../response-cache/services/cacheability.service';
import type { PurgeSpec, ResponseCacheService, WorkersCache } from '../../response-cache/services/response-cache.service';
import type { TagScopes } from '../../response-cache/tag-template';
import type { CacheableOptions, ResponseCacheModuleOptions } from '../../response-cache/types';
import type { Constructor } from '../../types';
import { getWsOnCloseMethod, getWsOnErrorMethod, getWsOnMessageMethod, isGateway } from '../../websocket/decorators';
import { GatewayContext } from '../../websocket/gateway-context';
import { DEFAULT_CONTENT_TYPE, HTTP_METHODS, METHOD_STATUS_CODES, ROUTER_CONTEXT_KEYS, SECURITY_SCHEMES } from '../constants';
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
import type { RouteMetadataRegistry, RouteResponseMeta, RouteSchemaMeta } from '../route-metadata';
import { RouterError } from '../router.error';
import { ROUTER_TOKENS } from '../router.tokens';
import { capturePayload, needsPayloadCapture } from './capture-payload';
import type {
    ControllerOptions,
    HttpMethod,
    RouteBodyObject,
    RouteConfig,
    RouteMetadata,
    RouteResponseObject,
    RouterEnv,
    SecuritySchemeRecord,
} from '../types';
import { buildRouteValidators } from '../validation/route-validators';
import { extractPathParams, toOpenAPIPath } from '../utils/path';
import { generateConventionRouteName } from '../utils/route-name';
import type { LocalePathService } from './locale-path.service';

const invokeHandler = async (instance: Record<string, (...args: unknown[]) => unknown>, method: string, ...args: unknown[]): Promise<unknown> => {
  return await instance[method](...args)
}

/**
 * The Cloudflare Workers Caching surface on `ExecutionContext` that Hono's
 * own `Context.executionCtx` type doesn't declare. See `executionCache`.
 */
interface CacheCapableExecutionContext {
  cache?: WorkersCache
  /**
   * The `ctx.props` this invocation was called with. Wholly part of the
   * Workers Caching key — see `partitionsResolved`, which verifies the
   * executing route's declared partitions are actually present here rather
   * than trusting the caller to have supplied them.
   */
  props?: Record<string, unknown>
}

/** True for anything with a callable `.then` — a `Promise`, or a thenable. */
function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function'
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
  private cacheableRouteCount = 0
  private bootCheckPerformed = false
  /**
   * The boot check's *result*, latched — not merely the fact that it ran.
   *
   * Latching only the attempt would make a misconfigured deploy fail exactly
   * one arbitrary request per isolate and then serve every later request
   * successfully, stamping `Cache-Control: public, max-age=…` while nothing
   * is ever cached: precisely the silent no-op `assertCachingAvailable` exists
   * to prevent. `cache.enabled` cannot change within an isolate's lifetime, so
   * a failure the first time is a failure every time — remember it and rethrow.
   */
  private bootCheckFailure: Error | undefined

  constructor(
    @inject(LOGGER_TOKENS.LoggerService) private logger: LoggerService,
    @inject(ROUTER_TOKENS.RouteRegistry) private registry: RouteRegistry,
    @inject(ROUTER_TOKENS.RouterResolver, { isOptional: true }) private routerResolver: RouterResolver | null,
    @inject(ROUTER_TOKENS.LocalePathService) private localePathService: LocalePathService,
    @inject(ROUTER_TOKENS.HonoApp) private app: HonoApp,
    @inject(DI_TOKENS.ModuleRegistry) private moduleRegistry: ModuleRegistry,
    @inject(ROUTER_TOKENS.RouteMetadataRegistry) private metadataRegistry: RouteMetadataRegistry,
    // The three dependencies below are only registered when the app imports
    // `ResponseCacheModule` — it is opt-in. Resolving them optionally (rather
    // than throwing at DI construction time) lets every other app keep
    // working unmodified; `collectRoutes` is what turns "used @Cacheable
    // without importing the module" into a boot-time error instead of a
    // request-time `null` dereference.
    @inject(RESPONSE_CACHE_TOKENS.CacheabilityService, { isOptional: true }) private cacheability?: CacheabilityService,
    @inject(RESPONSE_CACHE_TOKENS.ResponseCacheService, { isOptional: true }) private responseCache?: ResponseCacheService,
    @inject(RESPONSE_CACHE_TOKENS.Options, { isOptional: true }) private responseCacheOptions?: ResponseCacheModuleOptions,
    @inject(RESPONSE_CACHE_TOKENS.GatewayRouteTable, { isOptional: true }) private gatewayRouteTable?: GatewayRouteTable,
    @inject(RESPONSE_CACHE_TOKENS.PartitionResolverService, { isOptional: true }) private partitionResolver?: PartitionResolverService,
  ) { }

  /**
   * The cached entrypoint named by `forRoot({ gateway: { entrypoint } })`, or
   * `undefined` when no gateway is configured.
   *
   * A `Promise` (the `forRootAsync` trap) reads as "no gateway" here rather
   * than throwing: `responseCacheDefaults()` raises that as its own boot error
   * with a message about the real problem, and it is called first on every
   * path that consults this.
   */
  private gatewayEntrypoint(): string | undefined {
    const options = this.responseCacheOptions
    if (isThenable(options)) return undefined
    return options?.gateway?.entrypoint
  }

  /**
   * `ResponseCacheModule.forRoot({ defaults })`, resolved once at
   * construction (constructor injection is memoized on this singleton
   * instance) and falling back to `{}` when the module was never imported —
   * mirrors `OpenAPIConfigStore.getBaseConfig()`.
   *
   * `forRootAsync({ useFactory })` is a trap here: `ModuleRegistry` registers
   * the factory verbatim (`registerFactory`), and `Container.resolve()` never
   * awaits a factory's return value — so an async `useFactory` resolves this
   * token to a **Promise**, not the options object. Left unchecked, `?.defaults`
   * on a Promise is `undefined`, silently falling back to `{}` — including
   * silently dropping a `partitionBy` the author thought was enforced, the
   * exact per-user data leak this feature exists to prevent. Detected and
   * thrown here, once, at boot, rather than trusted per route.
   */
  private responseCacheDefaults(): Omit<CacheableOptions, 'tags'> {
    const options = this.responseCacheOptions

    if (isThenable(options)) {
      throw new ResponseCacheConfigError(
        'ResponseCacheModule.forRootAsync() options resolved to a Promise, not the awaited value. ' +
          'Route registration reads `defaults` synchronously — an async `useFactory` is never ' +
          'awaited before routes register, so `defaults` (and any `partitionBy` inside it) would be ' +
          'silently dropped instead of enforced, and every `@Cacheable` route would register as if no ' +
          'defaults were set. Use a synchronous `useFactory`, or resolve the options yourself and ' +
          'register them with `useValue` once the async work has settled.',
      )
    }

    return options?.defaults ?? {}
  }

  /**
   * Configure router with controllers and global middleware.
   * Resolves controllers from ModuleRegistry and global middleware from RouterResolver.
   */
  async configure(): Promise<void> {
    const controllers = this.moduleRegistry.getAllControllers()
    const globalMiddleware = this.routerResolver?.getGlobalMiddleware() ?? []

    // Before any route registers, so the dispatch middleware never observes a
    // table that is populated but not yet pointed at an entrypoint.
    this.gatewayRouteTable?.configure(this.gatewayEntrypoint())

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
      // `handle()` never goes through the per-method loop below — the only
      // place `bindRouteCache` runs — so a decorator here would silently
      // never fire and never warn: the exact class of silent failure this
      // task exists to eliminate. Throwing is simpler than computing a
      // binding for a single handler that serves arbitrary sub-paths (its
      // `{param.*}`/tags would need per-request path params a once-resolved
      // binding can't express), and it can be relaxed into real support
      // later without breaking anyone, since today it's a hard boot error.
      if (getCacheable(prototype, 'handle') || getPurgesCache(prototype, 'handle')) {
        throw new ResponseCacheConfigError(
          `${className}.handle: @Cacheable/@PurgesCache is not supported on wildcard controllers ` +
            '(those implementing `handle()`) yet — the decorator would be silently ignored, never ' +
            'firing and never warning, because wildcard routes do not go through per-method cache ' +
            'binding. Remove the decorator, or restructure this route as a decorated method.',
        )
      }

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
        const prefixShape = (routerConfig.params as ZodObject).shape
        mergedParams = mergedParams
          ? object({ ...(mergedParams as ZodObject).shape, ...prefixShape })
          : routerConfig.params
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

      const cacheableOptions = getCacheable(prototype, methodName)
      const purgesCacheOptions = getPurgesCache(prototype, methodName)

      const capturesPayload = needsPayloadCapture(cacheableOptions, purgesCacheOptions)

      // Resolved once per route, at registration — never per request. Throws
      // at boot for a non-empty `partitionBy` when no gateway entrypoint is
      // configured to honor it; see `bindRouteCache`.
      const cacheBinding = bindRouteCache(
        cacheableOptions,
        purgesCacheOptions,
        this.responseCacheDefaults(),
        {
          controller: className,
          method: methodName,
          guarded: allGuards.length > 0,
          routeParams: extractPathParams(fullPath),
          gatewayConfigured: this.gatewayEntrypoint() !== undefined,
        },
      )

      // `@Cacheable`/`@PurgesCache` read as configured intent even when
      // `ResponseCacheModule` was never imported — decorator metadata doesn't
      // require it. Catching that mismatch here, at boot, is the same
      // "silence is not safe" reasoning as the no-store stamp below: better a
      // clear startup error than a route that resolves `cacheBinding` and
      // then finds `this.cacheability`/`this.responseCache` are `undefined`
      // on the very first request.
      if (cacheBinding && (!this.cacheability || !this.responseCache)) {
        throw new ResponseCacheConfigError(
          `${className}.${methodName}: @Cacheable/@PurgesCache requires ResponseCacheModule to be ` +
            'imported. Without it, the decorator would be silently dropped — the route would ' +
            'register and run normally, just never cache or purge anything, with no warning at ' +
            'boot or at request time. Add `ResponseCacheModule.forRoot({ defaults: { ttl } })` to ' +
            'your app\'s `imports`.',
        )
      }

      // Track routes that need ctx.cache for boot-time validation.
      // Both @Cacheable and @PurgesCache routes require it: @Cacheable to apply
      // cache headers, @PurgesCache to purge on successful mutations. An app with
      // only @PurgesCache routes and no cache binding boots cleanly but then 500s
      // on every successful mutation — precisely the silent-until-hit failure this
      // check prevents.
      if (cacheBinding?.cacheable || cacheBinding?.purges) {
        this.cacheableRouteCount++
      }

      // A declared partition with no registered resolver would fail closed at
      // request time — correct, but silently uncached forever. Catch the typo
      // at boot instead, where the author still sees it.
      const partitionBy = cacheBinding?.cacheable?.partitionBy ?? []
      if (partitionBy.length > 0) {
        this.partitionResolver?.assertKnown(partitionBy, `${className}.${methodName}`)
      }

      const handler = this.createControllerHandler(ControllerClass, methodName, responseSchema, capturesPayload, cacheBinding)

      for (const route of expandedRoutes) {
        // Recorded per *expanded* route, so each version/locale variant is
        // keyed under the pattern Hono actually matched. `@All` routes are
        // registered under Hono's `ALL`, which no request method equals — but
        // only GET/HEAD ever loop back, so recording those two is exhaustive.
        if (partitionBy.length > 0) {
          const methods = httpMethod === 'all' ? ['GET', 'HEAD'] : [httpMethod]
          for (const method of methods) {
            this.gatewayRouteTable?.record(method, route.path, partitionBy)
          }
        }

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

          // Build per-route validators from declared schemas. A route with no
          // params/query/body declares none, so it attaches no validator and
          // pulls in no zod at all.
          const isLocaleVariant = route.isLocaleVariant ?? false
          const body = this.resolveBody(routeConfig)
          const validators = buildRouteValidators({
            params: routeConfig.params as ZodType | undefined,
            query: routeConfig.query as ZodType | undefined,
            body,
            isLocaleVariant,
          })

          // Wrap the controller handler so scoped middleware and guards run
          // AFTER the request validators (which populate `c.req.valid(...)`).
          // Final order: global app.use → request validators → scoped
          // middleware → guards → controller handler.
          const wrappedHandler = this.wrapHandlerWithChain(handler, effectiveMiddleware, allGuards)

          this.logger.info(`Registering route`, {
            controller: className,
            method: httpMethod.toUpperCase(),
            path: route.path,
            methodName,
            hidden: route.hidden,
          })

          // Path passed as a single-element array to match Hono's variadic
          // `on(method, paths, ...handlers)` overload (validators are a
          // variable-length list, so the fixed-arity overloads don't apply).
          this.app.on(httpMethod.toUpperCase(), [route.path], ...validators, wrappedHandler)

          // Collect schema metadata for lazy OpenAPI document generation.
          const metadata = this.mergeMetadata(controllerOpts, routeConfig, ControllerClass, methodName)
          this.metadataRegistry.add(this.buildRouteMetadata({
            method: httpMethod,
            path: route.path,
            routeConfig,
            metadata,
            body,
            methodName: meta.type === 'convention' ? methodName : undefined,
            statusCodeOverride,
            isLocaleVariant,
            hidden: route.hidden,
          }))
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
  ): { tags: string[]; security: SecuritySchemeRecord[]; groups: string[] } {
    const tags = [...(controllerOpts?.tags ?? []), ...(routeConfig.tags ?? [])]
    const groups = [...(controllerOpts?.groups ?? []), ...(routeConfig.groups ?? [])]

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

    return { tags, security: securityArray, groups }
  }

  /**
   * Resolve a route's request body into its schema + content type, normalizing
   * the bare-schema and `{ schema, contentType }` forms. Returns `undefined`
   * when no body is declared. Shared by validator construction and metadata.
   */
  private resolveBody(routeConfig: RouteConfig): { schema: ZodType; contentType: string } | undefined {
    if (!routeConfig.body) return undefined
    const schema = (this.isRouteBodyObject(routeConfig.body) ? routeConfig.body.schema : routeConfig.body)
    const contentType = this.isRouteBodyObject(routeConfig.body)
      ? routeConfig.body.contentType ?? DEFAULT_CONTENT_TYPE
      : DEFAULT_CONTENT_TYPE
    return { schema, contentType }
  }

  /**
   * Build the schema metadata entry for a route. Consumed lazily by the OpenAPI
   * generator — common error responses are added there, not here, so
   * `common.schemas` (and the schemas it references) never reach the routing
   * path. The `locale` path param of a localized route is recorded as plain
   * metadata (enforced by the route pattern, read via `getLocale()`), so no zod
   * enum is constructed at registration.
   */
  private buildRouteMetadata(input: {
    method: Exclude<HttpMethod, 'all'>
    path: string
    routeConfig: RouteConfig
    metadata: { tags: string[]; security: SecuritySchemeRecord[]; groups: string[] }
    body?: { schema: ZodType; contentType: string }
    methodName?: string
    statusCodeOverride?: number
    isLocaleVariant?: boolean
    hidden?: boolean
  }): RouteSchemaMeta {
    const { routeConfig, metadata } = input
    const successStatus: number = input.statusCodeOverride
      ?? (input.methodName ? METHOD_STATUS_CODES[input.methodName as keyof typeof METHOD_STATUS_CODES] : undefined)
      ?? 200

    const responses: RouteResponseMeta[] = []
    const responseDef = routeConfig.response
    if (responseDef && this.isRouteResponseObject(responseDef)) {
      responses.push({
        status: successStatus,
        schema: responseDef.schema,
        contentType: responseDef.contentType ?? DEFAULT_CONTENT_TYPE,
        description: responseDef.description ?? `Response ${successStatus}`,
      })
    } else {
      responses.push({
        status: successStatus,
        schema: responseDef,
        contentType: DEFAULT_CONTENT_TYPE,
        description: `Response ${successStatus}`,
      })
    }

    const localeConfig = this.localePathService.localePathConfig
    const localeParam = input.isLocaleVariant && localeConfig
      ? { name: 'locale', values: localeConfig.prefixedLocales }
      : undefined

    const entry: RouteSchemaMeta = {
      method: input.method,
      path: toOpenAPIPath(input.path),
      hidden: input.hidden ?? false,
      tags: metadata.tags,
      security: metadata.security,
      request: {
        params: routeConfig.params as ZodType | undefined,
        query: routeConfig.query as ZodType | undefined,
        body: input.body,
      },
      responses,
      localeParam,
    }
    if (routeConfig.summary) entry.summary = routeConfig.summary
    if (routeConfig.description) entry.description = routeConfig.description
    if (metadata.groups.length > 0) entry.groups = metadata.groups
    return entry
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
    capturesPayload = false,
    cacheBinding?: RouteCacheBinding,
  ): (c: Context<RouterEnv>) => Promise<Response> {
    const handler = async (c: Context<RouterEnv>) => {
      // Boot-time check: ensure Workers Caching is available if routes use it.
      // The *work* runs once per isolate, on the first request (to any route),
      // so we don't repeat it per request; the *outcome* is latched and
      // rethrown on every subsequent request, so a misconfigured deploy keeps
      // failing loudly instead of quietly succeeding from request #2 onward.
      // Fires even if the first request is to a non-cacheable route, catching
      // misconfiguration early.
      if (!this.bootCheckPerformed) {
        this.bootCheckPerformed = true
        try {
          assertCachingAvailable(this.cacheableRouteCount, this.executionCache(c))
        } catch (error) {
          // `assertCachingAvailable` only ever throws `ResponseCacheConfigError`.
          this.bootCheckFailure = error as Error
        }
      }
      if (this.bootCheckFailure) throw this.bootCheckFailure

      // Precognition short-circuit: HandlePrecognitiveRequests middleware
      // sets `validationSuccessResponse` for `Precognition: true` requests.
      // If we reach here, every request validator has passed — return the
      // 204 without invoking the controller body. Not stamped here — the
      // outermost `createNoStoreFallbackMiddleware` catches every response
      // that reaches Hono without a `Cache-Control`, this one included.
      const override = c.get('validationSuccessResponse')
      if (override) return override

      const ctx = new RouterContext(c)
      const requestContainer = ctx.getContainer()
      const controller = requestContainer.resolve<IController>(ControllerClass)

      const method = controller[methodName as keyof IController]
      if (typeof method === 'function') {
        const injectedArgs = this.resolveMethodInjections(ControllerClass.prototype as object, methodName, requestContainer)
        const response = await (method as (...args: unknown[]) => Promise<Response>).apply(controller, [ctx, ...injectedArgs])

        if (capturesPayload) await capturePayload(c, response)

        const validated = responseSchema && c.env.ENVIRONMENT !== 'production'
          ? await this.validateResponse(response, responseSchema)
          : response

        return this.applyCacheDecision(c, validated, cacheBinding, {
          controller: ControllerClass.name,
          method: methodName,
        })
      }

      throw new RouterError(`Method "${methodName}" not found on controller "${ControllerClass.name}"`)
    }

    this.nameHandler(handler, ControllerClass.name, methodName)
    return handler
  }

  /**
   * Apply this route's `@Cacheable`/`@PurgesCache` decision, if it has one.
   *
   * Deliberately does **not** stamp `no-store` for the "nothing to do" case
   * (`!cacheBinding`, or `cacheBinding.cacheable` absent) — the outermost
   * `createNoStoreFallbackMiddleware` (registered in `HonoApp`) catches every
   * response that reaches Hono without a `Cache-Control`, this one included,
   * so every response still gets an explicit decision without every call
   * site needing to know that. This function only needs to handle the
   * positive cases: computing `@Cacheable` headers, and firing `@PurgesCache`.
   *
   * `@PurgesCache` fires independently of `@Cacheable` — the common case is
   * a mutation route (create/update/destroy) that isn't itself cacheable but
   * must invalidate a GET route's cached entries on success. Gating the
   * purge on `cacheBinding.cacheable` would silently skip that purge.
   *
   * **Headers stamped here are not the last word.** This runs *inside* the
   * Hono route handler, so any outbound middleware — anything doing work
   * after its own `await next()` — sees the response afterwards and can
   * overwrite `Vary`, `Cache-Control`, or `Set-Cookie` with a plain
   * `c.header(name, value)`, which replaces rather than appends. That is
   * silent: the route still looks cached, but (for `Vary`) every variant
   * collapses onto one entry. Middleware that contributes to any of these
   * three headers must **merge** with what is already on the response, never
   * set it outright — see `InertiaMiddleware`'s `Vary: X-Inertia` handling
   * for the shape that fix takes.
   */
  private async applyCacheDecision(
    c: Context<RouterEnv>,
    response: Response,
    cacheBinding: RouteCacheBinding | undefined,
    routeContext: { controller: string; method: string },
  ): Promise<Response> {
    if (!cacheBinding) return response

    let scopes: TagScopes | undefined
    let result = response

    if (cacheBinding.cacheable) {
      // Not "guaranteed non-null and defensively re-checked" — an actual
      // invariant. `collectRoutes` throws at registration if a route
      // resolves a `cacheBinding` while `ResponseCacheModule` was never
      // imported, so reaching here without `cacheability` set means that
      // guard itself is broken. Throwing surfaces that immediately; quietly
      // falling through to "not cacheable" would mask the exact gap this
      // task closed.
      if (!this.cacheability) {
        throw new ResponseCacheConfigError(
          'internal error: a route resolved a `@Cacheable` binding but CacheabilityService is ' +
            'unavailable. This should have been caught at registration — please file a bug.',
        )
      }

      scopes = this.buildTagScopes(c)
      result = this.cacheability.apply(result, cacheBinding.cacheable, scopes, {
        partitionsResolved: this.partitionsResolved(c, cacheBinding.cacheable.partitionBy),
        // Only ever populated when `@stratal/inertia` rendered this response
        // (`InertiaService.render()` sets it) — `undefined` on every other
        // route, which `CacheabilityService.rejectionReason` treats as "no
        // Inertia-specific reason to reject".
        inertia: c.get('inertiaCacheSignals'),
      })
    }

    if (cacheBinding.purges && result.status >= 200 && result.status < 400) {
      if (!this.responseCache) {
        throw new ResponseCacheConfigError(
          'internal error: a route resolved a `@PurgesCache` binding but ResponseCacheService is ' +
            'unavailable. This should have been caught at registration — please file a bug.',
        )
      }

      scopes ??= this.buildTagScopes(c)
      const cache = this.executionCache(c)

      // Defensive invariant, not a path any correctly-configured deploy can
      // reach: `assertCachingAvailable` already fails boot (and stays
      // failed for the isolate's lifetime, see `bootCheckFailure`) the first
      // time any request finds `@PurgesCache`/`@Cacheable` routes registered
      // without `ctx.cache` — and `cache.enabled` is a static Wrangler
      // setting, so its presence cannot flip between requests within one
      // isolate. This only fires if that invariant is ever violated (e.g. a
      // caller hands this handler an inconsistent `executionCtx` per
      // request, as some tests do on purpose to reach this branch).
      if (!cache) {
        throw new CachePurgeError(
          'the `cache` binding is unavailable on this request\'s executionCtx — set ' +
            '`cache.enabled = true` (and a compatible compatibility_date) in your Wrangler ' +
            'config to use `@PurgesCache`.',
        )
      }

      let spec: PurgeSpec
      try {
        spec = this.responseCache.buildPurgeSpec(cacheBinding.purges, scopes)
      } catch (error) {
        // `buildPurgeSpec` renders this route's `@PurgesCache` tags, which
        // throws `InvalidCacheTagError` when a referenced value is missing —
        // `{query.tenant}` on a request with no `?tenant=`, `{data.categoryId}`
        // when the handler's own payload lacks that key. It is evaluated
        // *before* `this.responseCache.purge(...)` is ever entered, so
        // `purge`'s own try/catch (and its `logger.error`) never runs — left
        // unlogged, this would 500 with no signal anywhere, after the
        // mutation already committed. Log it here, at the only place that
        // still has the request's context, then rethrow as `CachePurgeError`
        // — the contract every other purge failure already uses — so a
        // caller catching purge failures only ever has one type to handle.
        const detail = error instanceof Error ? error.message : String(error)
        this.logger.error('[stratal:response-cache] Failed to render @PurgesCache tags', {
          controller: routeContext.controller,
          action: routeContext.method,
          path: c.req.routePath,
          error: detail,
        })
        throw new CachePurgeError(detail, error)
      }

      await this.responseCache.purge(spec, cache)
    }

    return result
  }

  /**
   * Whether this request's declared partitions are actually in the cache key.
   *
   * Reaching a controller **inline while running as the gateway** is, for a
   * route with a non-empty `partitionBy`, proof that they are not: the
   * dispatch middleware forwards every such `GET`/`HEAD` whose partitions it
   * could resolve, so the only way one arrives here is that it declined —
   * an unresolved resolver, a resolver that threw, or a primer that
   * short-circuited. Reporting `true` there would stamp
   * `Cache-Control: public, max-age=…` on a response the author declared
   * per-caller, and while the gateway's own Workers cache is disabled, that
   * header still travels to the client and to every intermediary between
   * them. One user's dashboard in a shared proxy cache is exactly the leak
   * `partitionBy` exists to prevent, so it fails closed instead.
   *
   * Inside the cached entrypoint the partitions normally *are* in the key,
   * because the gateway chose `ctx.props` before forwarding. But that is the
   * caller's claim, not a fact, and this entrypoint is reachable by anything
   * that can name it — another Worker's service binding, a misrouted export,
   * or our own gateway having selected an overlapping route's binding. So it
   * is checked rather than trusted: every partition this route declared must
   * be present in `ctx.props`. A caller that supplies none, or only some, gets
   * `private, no-store` instead of a shared entry.
   *
   * With **no execution context at all** — `hono.fetch(request, env)`, which
   * `quarry api` and `mcp serve` both do — there is no way to tell those cases
   * apart, so unknown means uncacheable. (Reachable in a real isolate: the
   * `assertCachingAvailable` boot check latches after the first request, so a
   * later context-less one sails past it to here.)
   *
   * An app with no gateway configured can never have a non-empty
   * `partitionBy` (`bindRouteCache` rejects it at boot), so this returns
   * `true` on the first line for every app that doesn't use the feature.
   */
  private partitionsResolved(c: Context<RouterEnv>, partitionBy: string[]): boolean {
    if (partitionBy.length === 0) return true

    let ctx: CacheCapableExecutionContext
    try {
      ctx = c.executionCtx
    } catch {
      return false
    }

    if (isGatewayMode(ctx)) return false

    const props = ctx.props
    return partitionBy.every((name) => props?.[name] !== undefined)
  }

  /**
   * `c.executionCtx` is a Hono getter that throws when the context wasn't
   * constructed with one (e.g. a bare `app.fetch(request)` in a unit test) —
   * unlike a plain optional property, there's no way to read it without a
   * `try`/`catch` when it might be absent. `cache` itself is optional even
   * when `executionCtx` exists: Wrangler only attaches it when `cache.enabled
   * = true` is configured.
   *
   * The cast is necessary despite `@cloudflare/workers-types` declaring
   * `cache?: CacheContext` on the *runtime* `ExecutionContext` — Hono's
   * `Context.executionCtx` getter is typed against Hono's own narrower
   * `ExecutionContext` interface (`waitUntil`/`passThroughOnException`/`props`
   * only), not Cloudflare's, so TypeScript doesn't know `.cache` exists on
   * what it returns even though the object handed to it at runtime does.
   *
   * **In gateway mode with a gateway configured, this is deliberately not
   * `ctx.cache`.** Only partitioned `GET`/`HEAD` requests are forwarded to the
   * cached entrypoint; every mutation — and so every `@PurgesCache` — runs
   * inline in the gateway, whose Wrangler config sets `cache: { enabled:
   * false }`. Purges are scoped to the entrypoint that issues them, so an
   * inline purge would either find no `ctx.cache` at all (and 500 a mutation
   * that already committed) or, if caching were left on for the gateway, purge
   * the gateway's own cache — reporting success while invalidating nothing and
   * leaving every cached read stale until its TTL ran out. Routing it over RPC
   * to the cached entrypoint puts the purge where the entries actually live.
   */
  private executionCache(c: Context<RouterEnv>): WorkersCache | undefined {
    let ctx: CacheCapableExecutionContext
    try {
      ctx = c.executionCtx
    } catch {
      return undefined
    }

    const entrypoint = this.gatewayEntrypoint()
    if (entrypoint !== undefined && isGatewayMode(ctx)) {
      return createLoopbackPurgeTarget(ctx, entrypoint)
    }

    return ctx.cache
  }

  /**
   * Values available to `{scope.path}` cache tag templates for this request.
   *
   * `body` is deliberately `undefined`: the parsed request body isn't cheaply
   * available at this point in the pipeline, and re-parsing it here would add
   * a second parse to every request on the hot path just to support a rarely
   * used tag scope. A `{body.*}` tag can therefore never resolve — but that's
   * never discovered here, or at request time at all: `bindRouteCache`
   * rejects any `@Cacheable`/`@PurgesCache` tag using the `body` scope at
   * route registration, so a route that reaches this method never has one to
   * render. (It was never true that both services "fail closed" on this —
   * `CacheabilityService` does, but `@PurgesCache`'s `renderTags` call has no
   * surrounding try/catch, so letting a `{body.*}` tag through would 500 the
   * request after its mutation already committed, which is exactly why the
   * boot-time check exists.)
   */
  private buildTagScopes(c: Context<RouterEnv>): TagScopes {
    return {
      param: c.req.param(),
      query: c.req.query(),
      body: undefined,
      data: c.get(ROUTER_CONTEXT_KEYS.RESPONSE_PAYLOAD),
    }
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
