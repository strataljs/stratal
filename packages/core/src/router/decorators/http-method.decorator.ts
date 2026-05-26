import { defineMetadata, getMetadata } from '../../di/metadata'
import { z } from '../../i18n/validation/zod'
import { ROUTE_METADATA_KEYS } from '../constants'
import type { ExplicitRouteMetadata, HttpMethod, RouteConfig } from '../types'

/**
 * Creates an HTTP method decorator factory for the given HTTP method.
 *
 * The returned decorator stores {@link ExplicitRouteMetadata} on the method and
 * tracks the method name under {@link ROUTE_METADATA_KEYS.DECORATED_METHODS}
 * on the controller prototype so they can be discovered at registration time.
 */
function createHttpMethodDecorator(method: HttpMethod) {
  return function (path: string, config?: RouteConfig) {
    return function (
      target: object,
      propertyKey: string,
      descriptor: PropertyDescriptor
    ) {
      const metadata: ExplicitRouteMetadata = {
        type: 'explicit',
        method,
        path,
        config: config ?? { response: z.any() },
      }

      defineMetadata(
        ROUTE_METADATA_KEYS.ROUTE_CONFIG,
        metadata,
        target,
        propertyKey
      )

      // Track this method as decorated on the prototype
      const existing: string[] =
        getMetadata<string[]>(ROUTE_METADATA_KEYS.DECORATED_METHODS, target) ?? []
      existing.push(propertyKey)
      defineMetadata(ROUTE_METADATA_KEYS.DECORATED_METHODS, existing, target)

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
 * Routes using @All are registered without OpenAPI validation
 * since OpenAPI does not support a catch-all HTTP method.
 *
 * @param path - Route path relative to the controller base path
 * @param config - Optional route configuration
 */
export const All = createHttpMethodDecorator('all')
