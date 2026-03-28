import type { Context, MiddlewareHandler } from 'hono'
import { languageDetector } from 'hono/language'
import type { Container } from '../di/container'
import { DI_TOKENS } from '../di/tokens'
import { createHttpExceptionContext } from '../errors/exception-context'
import type { ExceptionHandler } from '../errors/exception-handler'
import type { I18nModuleOptions } from '../i18n/i18n.options'
import { buildDetectorOptions } from '../i18n/i18n.options'
import { OpenAPIHono } from '../i18n/validation'
import type { LoggerService } from '../logger'
import { OPENAPI_TOKENS, type OpenAPIService } from '../openapi'
import type { Constructor } from '../types'
import { ROUTER_CONTEXT_KEYS } from './constants'
import type { IController } from './controller'
import { RouteNotFoundError } from './errors'
import { HonoAppAlreadyConfiguredError } from './errors/hono-app-already-configured.error'
import { SchemaValidationError } from './errors/schema-validation.error'
import { createLoggerMiddleware } from './middleware'
import type { Middleware } from './middleware.interface'
import { type RouteRegistry } from './route-registry'
import { RouterContext } from './router-context'
import type { RouterResolver } from './router-resolver'
import { ROUTER_TOKENS } from './router.tokens'
import { RouteRegistrationService } from './services/route-registration.service'
import type { LocalePathConfig, RouterEnv, VersioningOptions } from './types'

const isMiddlewareClass = (arg: unknown): arg is Constructor<Middleware> =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  typeof arg === 'function' && arg.prototype && 'handle' in arg.prototype


/**
 * HonoApp — extends OpenAPIHono with Stratal-specific setup
 *
 * Absorbs all Hono-related setup from the former RouterService and RequestScopeService:
 * - Request scope middleware (child container per request)
 * - Language detection via Hono's languageDetector middleware
 * - Global middleware (CORS, logging, error handling)
 * - defaultHook for validation errors
 * - `use()` overload for Stratal middleware classes
 * - `configure()` for module middleware, OpenAPI, routes, and 404
 */
export class HonoApp extends OpenAPIHono<RouterEnv> {
  private configured = false
  private readonly _container: Container
  private readonly _logger: LoggerService
  private readonly _pathDetectionEnabled: boolean
  private readonly _localePathConfig: LocalePathConfig | null

  /**
   * Reference to the original Hono `use` implementation.
   * Captured in constructor after super() sets it as an instance property.
   * Used by private methods to register middleware without going through the override.
   */
  private nativeUse!: typeof this.use

  constructor(
    container: Container,
    logger: LoggerService,
    i18nOptions?: I18nModuleOptions,
  ) {
    super({
      defaultHook: (result, c) => {
        if (!result.success) {
          throw new SchemaValidationError(result.error)
        }
        const override = c.get('validationSuccessResponse')
        if (override) return override
      },
    })

    this._container = container
    this._logger = logger

    // Determine path detection state for route registration
    const detection = i18nOptions?.detection
    const detectionEnabled = detection ? detection.enabled !== false : true
    const strategy = (detection && 'strategy' in detection && detection.strategy) ?? 'cookie'
    this._pathDetectionEnabled = detectionEnabled && strategy === 'path'

    if (this._pathDetectionEnabled) {
      const allLocales = i18nOptions?.locales ?? ['en']
      const defaultLocale = i18nOptions?.defaultLocale ?? 'en'
      const prefixDefaultLocale = (detection && 'prefixDefaultLocale' in detection && detection.prefixDefaultLocale !== undefined)
        ? detection.prefixDefaultLocale
        : false

      this._localePathConfig = prefixDefaultLocale === true
        ? { allLocales, prefixedLocales: allLocales, defaultLocale: null }
        : { allLocales, prefixedLocales: allLocales.filter(l => l !== defaultLocale), defaultLocale }
    } else {
      this._localePathConfig = null
    }

    // Capture Hono's original `use` (set by super() as an instance property)
    this.nativeUse = this.use

    // Override `use` to support Stratal middleware classes alongside Hono-native handlers
    this.use = ((...args: unknown[]) => {
      if (isMiddlewareClass(args[0])) {
        this.applyMiddlewareClasses('*', args as Constructor<Middleware>[])
        return this
      }

      if (typeof args[0] === 'string' && args.length > 1 && isMiddlewareClass(args[1])) {
        this.applyMiddlewareClasses(args[0], args.slice(1) as Constructor<Middleware>[])
        return this
      }

      return (this.nativeUse as (...a: unknown[]) => unknown)(...args)
    }) as typeof this.use

    // Internal setup — uses nativeUse to bypass the override
    this.setupRequestScope()
    if (detectionEnabled) {
      this.setupLanguageDetection(i18nOptions)
    }
    // Redirect requests to the prefixed default locale (e.g., /en/users → /users)
    // when prefixDefaultLocale is 'redirect'
    if (
      this._localePathConfig?.defaultLocale &&
      detection && 'prefixDefaultLocale' in detection && detection.prefixDefaultLocale === 'redirect'
    ) {
      this.setupDefaultLocaleRedirect(this._localePathConfig.defaultLocale)
    }
    this.setupGlobalMiddleware()
  }

  /**
   * Configure global middleware, OpenAPI endpoints, controller routes, and 404 handler.
   * Called once by Application.initialize().
   */
  async configure(
    controllers: Constructor<IController>[],
    routeRegistry: RouteRegistry,
    routerResolver: RouterResolver | null,
    globalMiddleware: Constructor<Middleware>[],
    versioningOptions?: VersioningOptions | null,
  ): Promise<void> {
    if (this.configured) throw new HonoAppAlreadyConfiguredError()

    // Global middleware from Router.use() (applies to ALL routes)
    if (globalMiddleware.length > 0) {
      this.applyMiddlewareClasses('*', globalMiddleware)
    }

    // OpenAPI endpoints
    const openAPIService = this._container.resolve<OpenAPIService>(OPENAPI_TOKENS.OpenAPIService)
    openAPIService.setupEndpoints(this, this._container)

    // Controller routes
    const routeRegistrationService = new RouteRegistrationService(
      this._logger, routeRegistry, routerResolver, versioningOptions ?? null, this._localePathConfig
    )
    await routeRegistrationService.configure(this, controllers)

    // Store registry in container for route() helper and route:list command
    this._container.registerValue(ROUTER_TOKENS.RouteRegistry, routeRegistry)

    // 404 handler (must be last)
    this.notFound((c) => { throw new RouteNotFoundError(c.req.path, c.req.method) })

    this.configured = true
  }

  private setupRequestScope(): void {
    this.nativeUse('*', async (c: Context<RouterEnv>, next: () => Promise<void>) => {
      const routerContext = new RouterContext(c)
      const requestContainer = this._container.createRequestScope(routerContext)
      c.set(ROUTER_CONTEXT_KEYS.REQUEST_CONTAINER, requestContainer)

      await next()
    })
  }

  /**
   * Apply Hono's languageDetector middleware and bridge the detected language
   * to Stratal's LOCALE context variable.
   */
  private setupLanguageDetection(i18nOptions?: I18nModuleOptions): void {
    const detectorOptions = buildDetectorOptions(i18nOptions)

    // Apply Hono's languageDetector
    this.nativeUse('*', languageDetector(detectorOptions) as MiddlewareHandler<RouterEnv>)

    // Bridge: sync Hono's 'language' variable to Stratal's LOCALE context key
    this.nativeUse('*', async (c: Context<RouterEnv>, next: () => Promise<void>) => {
      const language = (c as unknown as { get(key: 'language'): string | undefined }).get('language')
      if (language) {
        c.set(ROUTER_CONTEXT_KEYS.LOCALE, language)
      }
      await next()
    })
  }

  /**
   * Redirect requests that include the default locale prefix to the unprefixed path.
   * For example, `/en/users` → 301 redirect to `/users`.
   *
   * Only active when `prefixDefaultLocale` is `'redirect'`.
   */
  private setupDefaultLocaleRedirect(defaultLocale: string): void {
    const prefix = `/${defaultLocale}`
    this.nativeUse('*', async (c: Context<RouterEnv>, next: () => Promise<void>) => {
      const path = new URL(c.req.url).pathname
      if (path === prefix || path.startsWith(`${prefix}/`)) {
        const stripped = path.slice(prefix.length) || '/'
        return c.redirect(stripped, 301)
      }
      await next()
    })
  }

  private setupGlobalMiddleware(): void {
    this.nativeUse('*', createLoggerMiddleware(this._logger) as MiddlewareHandler<RouterEnv>)
    this.onError((err, c) => this.handleException(c, err))
  }

  private handleException(c: Context<RouterEnv>, err: unknown) {
    // Fallback to global container if request scope setup failed before storing REQUEST_CONTAINER
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard: REQUEST_CONTAINER may be unset if request scope middleware throws
    const requestContainer = c.get(ROUTER_CONTEXT_KEYS.REQUEST_CONTAINER) ?? this._container
    const handler = requestContainer.resolve<ExceptionHandler>(DI_TOKENS.ExceptionHandler)
    const ctx = createHttpExceptionContext(c)
    return handler.handle(err, ctx)
  }

  private applyMiddlewareClasses(path: string, classes: Constructor<Middleware>[]): this {
    this.nativeUse(path, async (c: Context<RouterEnv>, next: () => Promise<void>) => {
      const requestContainer = c.get(ROUTER_CONTEXT_KEYS.REQUEST_CONTAINER)
      const ctx = new RouterContext(c)

      // Build chain from end to start
      let current = next
      for (let i = classes.length - 1; i >= 0; i--) {
        const prevNext = current
        const middleware = requestContainer.resolve<Middleware>(classes[i])
        current = () => middleware.handle(ctx, prevNext) as Promise<void>
      }

      await current()
    })
    return this
  }
}
