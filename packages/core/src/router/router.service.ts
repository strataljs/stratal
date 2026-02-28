import { cors } from 'hono/cors'
import { inject } from 'tsyringe'
import { CONTAINER_TOKEN, type Container } from '../di'
import { Transient } from '../di/decorators'
import { DI_TOKENS } from '../di/tokens'
import { type StratalEnv } from '../env'
import { GlobalErrorHandler, getHttpStatus } from '../errors'
import { OpenAPIHono } from '../i18n/validation'
import { LOGGER_TOKENS, type LoggerService } from '../logger'
import {
  MiddlewareConfigurationService,
  type MiddlewareConfigEntry,
} from '../middleware'
import { OPENAPI_TOKENS, type OpenAPIService } from '../openapi'
import type { Constructor } from '../types'
import { ROUTER_CONTEXT_KEYS } from './constants'
import type { IController } from './controller'
import { RouteNotFoundError, RouterAlreadyConfiguredError, RouterNotConfiguredError } from './errors'
import { SchemaValidationError } from './errors/schema-validation.error'
import { createLoggerMiddleware } from './middleware'
import { ROUTER_TOKENS } from './router.tokens'
import { RequestScopeService } from './services/request-scope.service'
import { RouteRegistrationService } from './services/route-registration.service'
import type { RouterEnv } from './types'

/**
 * RouterService manages HTTP routing and request handling with OpenAPI support
 *
 * Responsibilities:
 * - Creates and configures OpenAPIHono application
 * - Delegates to specialized services:
 *   - RequestScopeService: Request-scoped container setup
 *   - OpenAPIService: OpenAPI spec and documentation endpoints
 *   - RouteRegistrationService: Controller and route registration
 * - Registers global middleware (CORS, logging, error handling)
 * - Handles fetch requests via Hono
 *
 * Note: Route access control (domain-based enforcement) is handled by
 * RouteAccessMiddleware in the tenancy module, applied via TenancyModule.configure().
 *
 * The service is registered as a singleton in the DI container
 * and accessed by the Backend worker's fetch() method.
 */
@Transient(ROUTER_TOKENS.RouterService)
export class RouterService {
  private app: OpenAPIHono<RouterEnv>
  private configured = false

  constructor(
    @inject(LOGGER_TOKENS.LoggerService)
    private logger: LoggerService,
    @inject(CONTAINER_TOKEN)
    private container: Container
  ) {
    this.app = new OpenAPIHono<RouterEnv>({
      defaultHook: (result, c) => {
        if (!result.success) {
          // Get request container (created by RequestScopeService)
          const requestContainer = c.get(ROUTER_CONTEXT_KEYS.REQUEST_CONTAINER)

          // Resolve GlobalErrorHandler from request container for i18n support
          const errorHandler = requestContainer.resolve<GlobalErrorHandler>(DI_TOKENS.ErrorHandler)

          // Convert ZodError to SchemaValidationError
          const validationError = new SchemaValidationError(result.error)

          // Process through global error handler for consistent formatting
          const errorResponse = errorHandler.handle(validationError)

          // Get HTTP status code from error code
          const status = getHttpStatus(errorResponse.code)

          return c.json(errorResponse, status)
        }
        // Validation succeeded, continue to handler
        return
      },
    })

    this.setupMiddleware()
  }

  /**
   * Setup all middleware in correct order
   * Note: OpenAPI setup is deferred to configure() because it needs controllers
   */
  private setupMiddleware(): void {
    // 1. Request-scoped container setup (MUST be FIRST)
    const requestScopeService = new RequestScopeService(this.container)
    requestScopeService.setupMiddleware(this.app)

    // 2. Global middleware (CORS, logging, error handling)
    this.setupGlobalMiddleware()

    // 3. OpenAPI documentation endpoints - deferred to configure()
  }

  /**
   * Setup global middleware that runs for all requests
   */
  private setupGlobalMiddleware(): void {
    // CORS middleware
    this.app.use('*', cors())

    // Request logger middleware (uses our Logger service)
    this.app.use('*', createLoggerMiddleware(this.logger))

    // Global error handler
    this.app.onError((err, c) => {
      // Resolve GlobalErrorHandler from request container (has I18nService for translation)
      const requestContainer = c.get(ROUTER_CONTEXT_KEYS.REQUEST_CONTAINER)
      const errorHandler = requestContainer.resolve<GlobalErrorHandler>(DI_TOKENS.ErrorHandler)

      // Handle all errors via GlobalErrorHandler
      const errorResponse = errorHandler.handle(err)
      const status = getHttpStatus(errorResponse.code)
      return c.json(errorResponse, status)
    })
  }

  /**
   * Configure router with middlewares and controllers atomically
   * This MUST be called immediately after RouterService construction
   * and can only be called once.
   *
   * @param middlewareConfigs - Array of middleware configuration entries from modules
   * @param controllers - Array of controller classes from modules
   */
  configure(middlewareConfigs: MiddlewareConfigEntry[], controllers: Constructor<IController>[]): void {
    if (this.configured) {
      throw new RouterAlreadyConfiguredError()
    }

    this.logger.info('Configuring router', {
      middlewareConfigCount: middlewareConfigs.length,
      controllerCount: controllers.length,
    })

    // 3. Apply middleware configurations FIRST (includes LocaleExtractionMiddleware, RouteAccessMiddleware)
    // Middleware must run before OpenAPI endpoints so locale and route context are available
    const middlewareConfigService = new MiddlewareConfigurationService(this.logger)
    middlewareConfigService.applyMiddlewares(this.app, middlewareConfigs, controllers, this.container)

    // 4. OpenAPI documentation endpoints (needs middleware to run first for i18n and route filtering)
    const openAPIService = this.container.resolve<OpenAPIService>(OPENAPI_TOKENS.OpenAPIService)
    openAPIService.setupEndpoints(this.app, controllers)

    // 5. Register controllers and routes
    const routeRegistrationService = new RouteRegistrationService(this.logger)
    routeRegistrationService.configure(this.app, controllers)

    // 6. Register 404 handler last
    this.app.notFound((c) => {
      throw new RouteNotFoundError(c.req.path, c.req.method)
    })

    this.configured = true
    this.logger.info('Router configuration complete')
  }

  /**
   * Handle incoming fetch request via Hono
   *
   * This method is called by the Backend worker's fetch() method.
   * The request-scoped container is created in RequestScopeService.
   *
   * @param request - Incoming Request object
   * @param env - Cloudflare environment bindings
   * @param ctx - Cloudflare execution context
   * @returns Response object
   */
  fetch(request: Request, env: StratalEnv, ctx: ExecutionContext): Response | Promise<Response> {
    if (!this.configured) {
      throw new RouterNotConfiguredError()
    }
    return this.app.fetch(request, env, ctx)
  }
}
