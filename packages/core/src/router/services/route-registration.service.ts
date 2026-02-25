import type { Context } from 'hono'
import { type Container, getMethodInjections } from '../../di'
import {
  type Guard,
  getControllerGuards,
  getMethodGuards,
  GuardExecutionService,
} from '../../guards'
import type { OpenAPIHono } from '../../i18n/validation'
import { createRoute } from '../../i18n/validation'
import { type LoggerService } from '../../logger'
import type { Constructor } from '../../types'
import { HTTP_METHODS, METHOD_STATUS_CODES, SECURITY_SCHEMES } from '../constants'
import type { IController } from '../controller'
import {
  getControllerOptions,
  getControllerRoute,
  getDecoratedMethods,
  getRouteConfig
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
  RouteConfig,
  RouterEnv,
  SecuritySchemeRecord,
} from '../types'

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

  constructor(
    private logger: LoggerService
  ) { }

  /**
   * Configure router with controllers
   *
   * @param app - OpenAPIHono application instance
   * @param controllers - Array of controller classes from modules
   */
  configure(
    app: OpenAPIHono<RouterEnv>,
    controllers: Constructor<IController>[]
  ): void {
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

    // Register controllers
    for (const ControllerClass of sortedControllers) {
      this.registerController(app, ControllerClass)
    }

    this.logger.info('Controller registration complete')
  }

  /**
   * Register a single controller with all its routes
   * Validates that controller has access decorator (strict mode)
   */
  private registerController(app: OpenAPIHono<RouterEnv>, ControllerClass: Constructor<IController>): void {
    const route = getControllerRoute(ControllerClass)

    if (!route) {
      throw new ControllerRegistrationError(
        ControllerClass.name,
        'Missing @Controller decorator or route metadata'
      )
    }

    const className = ControllerClass.name
    this.controllerClasses.set(className, ControllerClass)

    const prototype = ControllerClass.prototype as IController
    const controllerOpts = getControllerOptions(ControllerClass)

    // Handle wildcard routes (non-RESTful controllers)
    if (prototype.handle) {
      this.registerWildcardRoute(app, ControllerClass, route)
      return
    }

    // Check for OpenAPI decorated methods
    const decoratedMethods = getDecoratedMethods(ControllerClass)

    if (decoratedMethods.length > 0) {
      // Register OpenAPI routes
      this.registerOpenAPIRoutes(app, ControllerClass, route, decoratedMethods, controllerOpts)
    } else {
      // Fallback to traditional RESTful method registration (no OpenAPI)
      this.registerRESTfulRoutes(app, ControllerClass, route, prototype)
    }
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
   * Register OpenAPI routes with metadata
   */
  private registerOpenAPIRoutes(
    app: OpenAPIHono<RouterEnv>,
    ControllerClass: Constructor<IController>,
    route: string,
    decoratedMethods: string[],
    controllerOpts: ControllerOptions | undefined
  ): void {
    const className = ControllerClass.name
    const prototype = ControllerClass.prototype as IController

    // Check if entire controller is hidden from docs
    const controllerHidden = controllerOpts?.hideFromDocs ?? false

    // Collect controller-level guards
    const controllerGuards = getControllerGuards(ControllerClass)?.guards ?? []

    for (const methodName of decoratedMethods) {
      const routeConfig = getRouteConfig(prototype, methodName)
      if (!routeConfig) continue

      const derived = this.deriveHttpMethodAndPath(methodName, route)
      if (!derived) {
        this.logger.warn(`Cannot derive HTTP method/path for ${className}.${methodName}`)
        continue
      }

      // Check if route is hidden (route-level overrides controller-level)
      const hideFromDocs = routeConfig.hideFromDocs ?? controllerHidden

      if (hideFromDocs) {
        // Register route handler without OpenAPI metadata
        this.logger.info(`Registering hidden route (no OpenAPI)`, {
          controller: className,
          method: derived.method.toUpperCase(),
          path: derived.path,
          methodName,
        })

        this.registerRouteWithoutOpenAPI(app, ControllerClass, methodName, derived)
        continue
      }

      // Collect method-level guards
      const methodGuards = getMethodGuards(prototype, methodName)?.guards ?? []

      // Combine controller and method guards
      // Controller guards run first, then method guards
      const allGuards: Guard[] = [...controllerGuards, ...methodGuards]

      if (allGuards.length > 0) {
        this.logger.info(`Route guards`, {
          controller: className,
          method: derived.method.toUpperCase(),
          path: derived.path,
          methodName,
          guardCount: allGuards.length,
        })
      }

      // Build and register OpenAPI route
      const metadata = this.mergeMetadata(controllerOpts, routeConfig, ControllerClass, methodName)
      const openApiRoute = this.buildOpenAPIRoute(
        derived.method,
        derived.path,
        routeConfig,
        metadata,
        allGuards,
        methodName
      )

      this.logger.info(`Registering OpenAPI route`, {
        controller: className,
        method: derived.method.toUpperCase(),
        path: derived.path,
        methodName,
        tags: metadata.tags,
      })

      // Register OpenAPI route with handler
      app.openapi(openApiRoute, async (c) => {
        const ctx = new RouterContext(c)
        const requestContainer = ctx.getContainer()
        const controller = requestContainer.resolve<IController>(ControllerClass)
        const method = controller[methodName as keyof IController]
        if (typeof method === 'function') {
          const injectedArgs = this.resolveMethodInjections(prototype, methodName, requestContainer)
          return await (method as (...args: unknown[]) => Promise<Response>).call(controller, ctx, ...injectedArgs)
        }
        throw new ControllerMethodNotFoundError(methodName, className)
      })
    }
  }

  /**
   * Register route without OpenAPI metadata (for hidden routes)
   * Route is functional but won't appear in documentation
   */
  private registerRouteWithoutOpenAPI(
    app: OpenAPIHono<RouterEnv>,
    ControllerClass: Constructor<IController>,
    methodName: string,
    derived: { method: HttpMethod; path: string }
  ): void {
    // Create handler function
    const prototype = ControllerClass.prototype as IController
    const handler = async (c: Context<RouterEnv>) => {
      const ctx = new RouterContext(c)
      const requestContainer = ctx.getContainer()
      const controller = requestContainer.resolve<IController>(ControllerClass)
      const method = controller[methodName as keyof IController]
      if (typeof method === 'function') {
        const injectedArgs = this.resolveMethodInjections(prototype, methodName, requestContainer)
        return await (method as (...args: unknown[]) => Promise<Response>).call(controller, ctx, ...injectedArgs)
      }
      throw new ControllerMethodNotFoundError(methodName, ControllerClass.name)
    }

    // Register route handler without OpenAPI metadata using type-safe method dispatch
    // Note: Only common HTTP methods (get, post, put, patch, delete) are supported
    // For other methods, we fall back to all() which accepts any HTTP method
    switch (derived.method) {
      case 'get':
        app.get(derived.path, handler)
        break
      case 'post':
        app.post(derived.path, handler)
        break
      case 'put':
        app.put(derived.path, handler)
        break
      case 'patch':
        app.patch(derived.path, handler)
        break
      case 'delete':
        app.delete(derived.path, handler)
        break
      default:
        // For head, options, trace, or any other method, use all()
        app.all(derived.path, handler)
        break
    }
  }


  /**
   * Register traditional RESTful routes without OpenAPI
   */
  private registerRESTfulRoutes(
    app: OpenAPIHono<RouterEnv>,
    ControllerClass: Constructor<IController>,
    route: string,
    prototype: IController
  ): void {
    if (prototype.index) {
      app.get(route, this.createControllerHandler(ControllerClass, 'index'))
    }
    if (prototype.show) {
      app.get(`${route}/:id`, this.createControllerHandler(ControllerClass, 'show'))
    }
    if (prototype.create) {
      app.post(route, this.createControllerHandler(ControllerClass, 'create'))
    }
    if (prototype.update) {
      app.put(`${route}/:id`, this.createControllerHandler(ControllerClass, 'update'))
    }
    if (prototype.patch) {
      app.patch(`${route}/:id`, this.createControllerHandler(ControllerClass, 'patch'))
    }
    if (prototype.destroy) {
      app.delete(`${route}/:id`, this.createControllerHandler(ControllerClass, 'destroy'))
    }
  }

  /**
   * Auto-derive HTTP method and path from controller method name
   * Uses HTTP_METHODS constant for RESTful convention mapping
   */
  private deriveHttpMethodAndPath(methodName: string, basePath: string): { method: HttpMethod; path: string } | null {
    if (!(methodName in HTTP_METHODS)) return null
    const mapping = HTTP_METHODS[methodName as keyof typeof HTTP_METHODS]

    return {
      method: mapping.method as HttpMethod,
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
    method: HttpMethod,
    path: string,
    routeConfig: RouteConfig,
    metadata: { tags: string[]; security: Record<string, string[]>[] },
    guards: Guard[],
    methodName?: string
  ): OpenAPIRouteConfig {
    try {
      const route: Partial<OpenAPIRouteConfig> = {
        method,
        path,
        request: {},
        responses: {},
      }

      // Add guard execution middleware using Hono's built-in middleware property
      if (guards.length > 0) {
        route.middleware = [this.createGuardMiddleware(guards)]
      }

      // Add request body if defined
      if (routeConfig.body) {
        route.request = {
          ...route.request,
          body: {
            content: {
              'application/json': {
                schema: routeConfig.body,
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

      // Derive success status code from method name

      const successStatus = (methodName && METHOD_STATUS_CODES[methodName as keyof typeof METHOD_STATUS_CODES]) ?? 200

      // Build responses object with auto-derived status
      const responses: NonNullable<OpenAPIRouteConfig['responses']> = {}

      // Add success response with derived status code
      const responseDef = routeConfig.response
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- response may be undefined at runtime
      if (responseDef) {
        if (typeof responseDef === 'object' && 'schema' in responseDef) {
          responses[successStatus] = {
            content: {
              'application/json': { schema: responseDef.schema },
            },
            description: responseDef.description ?? `Response ${successStatus}`,
          }
        } else {
          responses[successStatus] = {
            content: {
              'application/json': { schema: responseDef },
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
   * Create controller handler that resolves controller from request-scoped container
   * This ensures each request gets a fresh controller with request-scoped context
   */
  private createControllerHandler(
    ControllerClass: new (...args: unknown[]) => IController,
    methodName: keyof IController
  ): (c: Context<RouterEnv>) => Promise<Response> {
    return async (c: Context<RouterEnv>) => {
      this.logger.info('Handler invoked', {
        path: c.req.path,
        method: c.req.method,
        controller: ControllerClass.name,
        methodName: methodName as string,
      })

      try {
        const ctx = new RouterContext(c)
        const requestContainer = ctx.getContainer()

        // Resolve controller from request-scoped container
        // Controller will get request-scoped TenancyContext via DI
        const controller = requestContainer.resolve<IController>(ControllerClass)

        const method = controller[methodName]
        if (typeof method === 'function') {
          const injectedArgs = this.resolveMethodInjections(ControllerClass.prototype as object, methodName as string, requestContainer)
          return await (method as (...args: unknown[]) => Promise<Response>).apply(controller, [ctx, ...injectedArgs])
        }

        throw new ControllerMethodNotFoundError(methodName as string, ControllerClass.name)
      } catch (error) {
        this.logger.error('Error in controller handler', {
          controller: ControllerClass.name,
          methodName: methodName as string,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        })
        throw error
      }
    }
  }
}
