import type { IController } from '../router/controller'
import type { Middleware } from '../router/middleware.interface'
import type { HttpMethod } from '../router/types'
import type { Constructor } from '../types'

/**
 * Route information for middleware targeting
 */
export interface RouteInfo {
  /** Route path pattern (e.g., '/api/v1/users', '/health') */
  path: string
  /** HTTP method(s) to match. If omitted, matches all methods */
  method?: HttpMethod | HttpMethod[]
}

/**
 * Internal configuration entry for middleware registration
 */
export interface MiddlewareConfigEntry {
  /** Middleware classes to apply */
  middlewares: Constructor<Middleware>[]
  /** Routes to exclude from middleware */
  excludes: RouteInfo[]
  /** Target routes for middleware */
  routes: MiddlewareRouteTarget[]
}

/**
 * Valid targets for middleware routes
 * - Controller class: Apply to all routes in that controller
 * - RouteInfo: Apply to specific path/method combination
 * - '*': Apply to all routes (global middleware)
 */
export type MiddlewareRouteTarget = Constructor<IController> | RouteInfo | '*'

/**
 * Interface for modules that configure middleware
 *
 * Implement this interface in your module class to configure
 * middleware using the consumer pattern.
 *
 * @example
 * ```typescript
 * @Module({ providers: [...] })
 * export class AppModule implements MiddlewareConfigurable {
 *   configure(consumer: MiddlewareConsumer): void {
 *     consumer
 *       .apply(LoggingMiddleware, CorsMiddleware)
 *       .exclude({ path: '/health', method: 'get' })
 *       .forRoutes('*')
 *
 *     consumer
 *       .apply(TenantMiddleware)
 *       .forRoutes(TenantsController, SchoolsController)
 *   }
 * }
 * ```
 */
export interface MiddlewareConfigurable {
  /**
   * Configure middleware for this module
   * @param consumer - Middleware consumer for fluent configuration
   */
  configure(consumer: MiddlewareConsumer): void
}

/**
 * Forward declaration for MiddlewareConsumer
 * Implementation in middleware-consumer.ts
 */
export interface MiddlewareConsumer {
  /**
   * Specify middleware(s) to apply
   * @param middlewares - Middleware classes to apply
   * @returns Builder for configuring routes
   */
  apply(...middlewares: Constructor<Middleware>[]): MiddlewareBuilder
  /**
   * Get all configured middleware entries
   */
  getEntries(): MiddlewareConfigEntry[]
}

/**
 * Forward declaration for MiddlewareBuilder
 * Implementation in middleware-consumer.ts
 */
export interface MiddlewareBuilder {
  /**
   * Exclude routes from middleware
   * @param routes - Routes to exclude (path strings or RouteInfo objects)
   */
  exclude(...routes: (string | RouteInfo)[]): this
  /**
   * Apply middleware to specified routes
   * @param targets - Controller classes, route patterns, or '*' for global
   */
  forRoutes(...targets: MiddlewareRouteTarget[]): void
}
