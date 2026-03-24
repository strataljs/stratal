import type { Context, MiddlewareHandler } from 'hono'
import type { Container } from '../di/container'
import { DI_TOKENS } from '../di/tokens'
import { createHttpExceptionContext } from '../errors/exception-context'
import type { ExceptionHandler } from '../errors/exception-handler'
import { OpenAPIHono } from '../i18n/validation'
import type { LoggerService } from '../logger'
import {
  MiddlewareConfigurationService,
  type MiddlewareConfigEntry,
} from '../middleware'
import { OPENAPI_TOKENS, type OpenAPIService } from '../openapi'
import type { Constructor } from '../types'
import { ROUTER_CONTEXT_KEYS } from './constants'
import type { IController } from './controller'
import { RouteNotFoundError } from './errors'
import { HonoAppAlreadyConfiguredError } from './errors/hono-app-already-configured.error'
import { SchemaValidationError } from './errors/schema-validation.error'
import { createLoggerMiddleware } from './middleware'
import type { Middleware } from './middleware.interface'
import { RouterContext } from './router-context'
import { RouteRegistrationService } from './services/route-registration.service'
import type { RouterEnv, VersioningOptions } from './types'

const isMiddlewareClass = (arg: unknown): arg is Constructor<Middleware> =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  typeof arg === 'function' && arg.prototype && 'handle' in arg.prototype


/**
 * HonoApp — extends OpenAPIHono with Stratal-specific setup
 *
 * Absorbs all Hono-related setup from the former RouterService and RequestScopeService:
 * - Request scope middleware (child container per request)
 * - Global middleware (CORS, logging, error handling)
 * - defaultHook for validation errors
 * - `use()` overload for Stratal middleware classes
 * - `configure()` for module middleware, OpenAPI, routes, and 404
 */
export class HonoApp extends OpenAPIHono<RouterEnv> {
  private configured = false
  private readonly _container: Container
  private readonly _logger: LoggerService

  /**
   * Reference to the original Hono `use` implementation.
   * Captured in constructor after super() sets it as an instance property.
   * Used by private methods to register middleware without going through the override.
   */
  private nativeUse!: typeof this.use

  constructor(
    container: Container,
    logger: LoggerService,
  ) {
    super({
      defaultHook: (result) => {
        if (!result.success) {
          throw new SchemaValidationError(result.error)
        }
      },
    })

    this._container = container
    this._logger = logger

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
    this.setupGlobalMiddleware()
  }

  /**
   * Configure module middleware, OpenAPI endpoints, controller routes, and 404 handler.
   * Called once by Application.initialize().
   */
  async configure(
    middlewareConfigs: MiddlewareConfigEntry[],
    controllers: Constructor<IController>[],
    versioningOptions?: VersioningOptions | null,
  ): Promise<void> {
    if (this.configured) throw new HonoAppAlreadyConfiguredError()

    // Module middleware
    const middlewareConfigService = new MiddlewareConfigurationService(this._logger, versioningOptions ?? null)
    middlewareConfigService.applyMiddlewares(this, middlewareConfigs, controllers, this._container)

    // OpenAPI endpoints
    const openAPIService = this._container.resolve<OpenAPIService>(OPENAPI_TOKENS.OpenAPIService)
    openAPIService.setupEndpoints(this, this._container)

    // Controller routes
    const routeRegistrationService = new RouteRegistrationService(this._logger, versioningOptions ?? null)
    await routeRegistrationService.configure(this, controllers)

    // 404 handler (must be last)
    this.notFound((c) => { throw new RouteNotFoundError(c.req.path, c.req.method) })

    this.configured = true
  }

  private setupRequestScope(): void {
    this.nativeUse('*', async (c: Context<RouterEnv>, next: () => Promise<void>) => {
      const routerContext = new RouterContext(c)
      const requestContainer = this._container.createRequestScope(routerContext)
      c.set(ROUTER_CONTEXT_KEYS.REQUEST_CONTAINER, requestContainer)
      try {
        await next()
      } finally {
        //@ts-expect-error  Type 'void' is not assignable to type 'Promise<any>'
        c.executionCtx.waitUntil(requestContainer.dispose())
      }
    })
  }

  private setupGlobalMiddleware(): void {
    this.nativeUse('*', createLoggerMiddleware(this._logger) as MiddlewareHandler<RouterEnv>)
    this.onError((err, c) => {
      const requestContainer = c.get(ROUTER_CONTEXT_KEYS.REQUEST_CONTAINER)
      const handler = requestContainer.resolve<ExceptionHandler>(DI_TOKENS.ExceptionHandler)
      const ctx = createHttpExceptionContext(c)
      return handler.handle(err, ctx)
    })
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
        current = () => middleware.handle(ctx, prevNext)
      }

      await current()
    })
    return this
  }
}
