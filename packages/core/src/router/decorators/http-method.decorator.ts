import { z } from '../../i18n/validation'
import { ROUTE_METADATA_KEYS } from '../constants'
import type { HttpMethod, HttpRouteMetadata, RouteConfig } from '../types'

/**
 * Creates an HTTP method decorator factory for the given HTTP method.
 *
 * The returned decorator stores {@link HttpRouteMetadata} on the method and
 * tracks the method name under {@link ROUTE_METADATA_KEYS.HTTP_DECORATED_METHODS}
 * on the controller prototype so they can be discovered at registration time.
 */
function createHttpMethodDecorator(method: HttpMethod) {
  return function (path: string, config?: RouteConfig) {
    return function (
      target: object,
      propertyKey: string,
      descriptor: PropertyDescriptor
    ) {
      const metadata: HttpRouteMetadata = {
        method,
        path,
        config: config ?? { response: z.any() },
      }

      Reflect.defineMetadata(
        ROUTE_METADATA_KEYS.HTTP_ROUTE_CONFIG,
        metadata,
        target,
        propertyKey
      )

      // Track this method as HTTP-decorated on the prototype
      const existing: string[] =
        (Reflect.getOwnMetadata(ROUTE_METADATA_KEYS.HTTP_DECORATED_METHODS, target) as string[] | undefined) ?? []
      existing.push(propertyKey)
      Reflect.defineMetadata(ROUTE_METADATA_KEYS.HTTP_DECORATED_METHODS, existing, target)

      return descriptor
    }
  }
}

/**
 * Registers a GET route on the controller method.
 *
 * @param path - Route path relative to the controller base path
 * @param config - Optional route configuration (response schema, body, params, etc.)
 *
 * @example
 * ```typescript
 * @Controller('/api/v1/users')
 * class UsersController {
 *   @Get('/', { response: z.array(userSchema), summary: 'List users' })
 *   async list(ctx: RouterContext) { ... }
 *
 *   @Get('/:id', { params: z.object({ id: z.string().uuid() }), response: userSchema })
 *   async getUser(ctx: RouterContext) { ... }
 * }
 * ```
 */
export const Get = createHttpMethodDecorator('get')

/**
 * Registers a POST route on the controller method.
 *
 * @param path - Route path relative to the controller base path
 * @param config - Optional route configuration (response schema, body, params, etc.)
 *
 * @example
 * ```typescript
 * @Controller('/api/v1/users')
 * class UsersController {
 *   @Post('/', { body: createUserSchema, response: userSchema, statusCode: 201 })
 *   async createUser(ctx: RouterContext) { ... }
 * }
 * ```
 */
export const Post = createHttpMethodDecorator('post')

/**
 * Registers a PUT route on the controller method.
 *
 * @param path - Route path relative to the controller base path
 * @param config - Optional route configuration
 */
export const Put = createHttpMethodDecorator('put')

/**
 * Registers a PATCH route on the controller method.
 *
 * @param path - Route path relative to the controller base path
 * @param config - Optional route configuration
 */
export const Patch = createHttpMethodDecorator('patch')

/**
 * Registers a DELETE route on the controller method.
 *
 * @param path - Route path relative to the controller base path
 * @param config - Optional route configuration
 */
export const Delete = createHttpMethodDecorator('delete')

/**
 * Registers an ALL (any HTTP method) route on the controller method.
 * Routes using @All are automatically hidden from OpenAPI documentation
 * since OpenAPI does not support a catch-all HTTP method.
 *
 * @param path - Route path relative to the controller base path
 * @param config - Optional route configuration
 */
export const All = createHttpMethodDecorator('all')

/**
 * Get the HTTP route metadata from a controller method decorated with
 * @Get, @Post, @Put, @Patch, @Delete, or @All.
 *
 * @param target - Controller prototype
 * @param methodName - Name of the method
 * @returns HTTP route metadata or undefined if not decorated
 */
export function getHttpRouteMetadata(target: object, methodName: string): HttpRouteMetadata | undefined {
  return Reflect.getMetadata(ROUTE_METADATA_KEYS.HTTP_ROUTE_CONFIG, target, methodName) as HttpRouteMetadata | undefined
}

/**
 * Get all methods decorated with HTTP method decorators from a controller class.
 *
 * @param ControllerClass - Controller class
 * @returns Array of method names that have HTTP route metadata
 */
export function getHttpDecoratedMethods(ControllerClass: new (...args: unknown[]) => object): string[] {
  const prototype = ControllerClass.prototype as object
  return (Reflect.getOwnMetadata(ROUTE_METADATA_KEYS.HTTP_DECORATED_METHODS, prototype) as string[] | undefined) ?? []
}
