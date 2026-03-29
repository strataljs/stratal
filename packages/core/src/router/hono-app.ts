import type { Context, MiddlewareHandler } from 'hono'
import { inject } from 'tsyringe'
import type { Container } from '../di/container'
import { runWithContainer } from '../di/container-storage'
import { Transient } from '../di/decorators'
import { CONTAINER_TOKEN, DI_TOKENS } from '../di/tokens'
import { createHttpExceptionContext } from '../errors/exception-context'
import type { ExceptionHandler } from '../errors/exception-handler'
import { OpenAPIHono } from '../i18n/validation'
import { LOGGER_TOKENS, type LoggerService } from '../logger'
import { OPENAPI_TOKENS, type OpenAPIService } from '../openapi'
import type { Constructor } from '../types'
import { ROUTER_CONTEXT_KEYS } from './constants'
import { HonoAppAlreadyConfiguredError, RouteNotFoundError, SchemaValidationError } from './errors'
import { createLoggerMiddleware, createMiddlewareChain } from './middleware'
import type { Middleware } from './middleware.interface'
import { RouterContext } from './router-context'
import { RouteRegistrationService } from './services/route-registration.service'
import type { RouterEnv } from './types'

const isMiddlewareClass = (arg: unknown): arg is Constructor<Middleware> =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  typeof arg === 'function' && arg.prototype && 'handle' in arg.prototype


/**
 * HonoApp — extends OpenAPIHono with Stratal-specific setup
 *
 * - Request scope middleware (child container per request)
 * - Global middleware (CORS, logging, error handling)
 * - defaultHook for validation errors
 * - `use()` overload for Stratal middleware classes
 * - `configure()` for OpenAPI, routes, and 404
 */
@Transient()
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
    @inject(CONTAINER_TOKEN) container: Container,
    @inject(LOGGER_TOKENS.LoggerService) logger: LoggerService,
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

    // Capture Hono's original `use` (set by super() as an instance property)
    this.nativeUse = this.use

    // Override `use` to support Stratal middleware classes alongside Hono-native handlers
    this.use = ((...args: unknown[]) => {
      if (isMiddlewareClass(args[0])) {
        this.nativeUse('*', createMiddlewareChain(args as Constructor<Middleware>[]))
        return this
      }

      if (typeof args[0] === 'string' && args.length > 1 && isMiddlewareClass(args[1])) {
        this.nativeUse(args[0], createMiddlewareChain(args.slice(1) as Constructor<Middleware>[]))
        return this
      }

      return (this.nativeUse as (...a: unknown[]) => unknown)(...args)
    }) as typeof this.use

    // Internal setup — uses nativeUse to bypass the override
    this.setupRequestScope()
    this.applyGlobalMiddleware()
  }

  /**
   * Apply global middleware (logger + error handler).
   * Called by Application after locale middleware is applied by LocalePathService.
   */
  private applyGlobalMiddleware(): void {
    this.nativeUse('*', createLoggerMiddleware(this._logger) as MiddlewareHandler<RouterEnv>)
    this.onError((err, c) => this.handleException(c, err))
  }

  /**
   * Configure OpenAPI endpoints, controller routes, and 404 handler.
   * Called once by Application.initialize().
   */
  async configure(): Promise<void> {
    if (this.configured) throw new HonoAppAlreadyConfiguredError()

    // OpenAPI endpoints
    const openAPIService = this._container.resolve<OpenAPIService>(OPENAPI_TOKENS.OpenAPIService)
    openAPIService.setupEndpoints(this, this._container)

    // Controller routes + global middleware
    const routeRegistrationService = this._container.resolve<RouteRegistrationService>(RouteRegistrationService)
    await routeRegistrationService.configure()

    // 404 handler (must be last)
    this.notFound((c) => { throw new RouteNotFoundError(c.req.path, c.req.method) })

    this.configured = true
  }

  private setupRequestScope(): void {
    this.nativeUse('*', async (c: Context<RouterEnv>, next: () => Promise<void>) => {
      const routerContext = new RouterContext(c)
      const requestContainer = this._container.createRequestScope(routerContext)
      c.set(ROUTER_CONTEXT_KEYS.REQUEST_CONTAINER, requestContainer)

      await runWithContainer(requestContainer, next)
    })
  }

  private handleException(c: Context<RouterEnv>, err: unknown) {
    // Fallback to global container if request scope setup failed before storing REQUEST_CONTAINER
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard: REQUEST_CONTAINER may be unset if request scope middleware throws
    const requestContainer = c.get(ROUTER_CONTEXT_KEYS.REQUEST_CONTAINER) ?? this._container
    const handler = requestContainer.resolve<ExceptionHandler>(DI_TOKENS.ExceptionHandler)
    const ctx = createHttpExceptionContext(c)
    return handler.handle(err, ctx)
  }
}
