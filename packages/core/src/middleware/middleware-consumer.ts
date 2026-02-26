import type { Middleware } from '../router/middleware.interface'
import type { Constructor } from '../types'
import type {
  MiddlewareConfigEntry,
  MiddlewareConsumer as IMiddlewareConsumer,
  MiddlewareBuilder as IMiddlewareBuilder,
  MiddlewareRouteTarget,
  RouteInfo,
} from './types'

/**
 * Builder for configuring middleware routes and exclusions
 *
 * Provides fluent API for specifying where middleware should apply.
 */
class MiddlewareBuilderImpl implements IMiddlewareBuilder {
  private middlewares: Constructor<Middleware>[]
  private excludedRoutes: RouteInfo[] = []
  private consumer: MiddlewareConsumerImpl

  constructor(
    middlewares: Constructor<Middleware>[],
    consumer: MiddlewareConsumerImpl
  ) {
    this.middlewares = middlewares
    this.consumer = consumer
  }

  /**
   * Exclude specific routes from middleware
   *
   * @param routes - Routes to exclude (path strings or RouteInfo objects)
   * @returns this for method chaining
   *
   * @example
   * ```typescript
   * consumer
   *   .apply(AuthMiddleware)
   *   .exclude('/health', { path: '/api/public', method: 'get' })
   *   .forRoutes('*')
   * ```
   */
  exclude(...routes: (string | RouteInfo)[]): this {
    for (const route of routes) {
      if (typeof route === 'string') {
        this.excludedRoutes.push({ path: route })
      } else {
        this.excludedRoutes.push(route)
      }
    }
    return this
  }

  /**
   * Apply middleware to specified routes
   *
   * This method finalizes the configuration and registers it with the consumer.
   *
   * @param targets - Controller classes, RouteInfo objects, or '*' for global
   *
   * @example
   * ```typescript
   * // Apply to all routes
   * consumer.apply(LoggingMiddleware).forRoutes('*')
   *
   * // Apply to specific controllers
   * consumer.apply(CorsMiddleware).forRoutes(ApiController, WebhooksController)
   *
   * // Apply to specific paths
   * consumer.apply(RateLimitMiddleware).forRoutes(
   *   { path: '/api/v1/auth', method: 'post' }
   * )
   * ```
   */
  forRoutes(...targets: MiddlewareRouteTarget[]): void {
    const entry: MiddlewareConfigEntry = {
      middlewares: this.middlewares,
      excludes: this.excludedRoutes,
      routes: targets,
    }
    this.consumer.addEntry(entry)
  }
}

/**
 * Consumer for configuring middleware in modules
 *
 * Provides fluent API for registering middleware with route targeting.
 * Used by modules implementing MiddlewareConfigurable interface.
 *
 * @example
 * ```typescript
 * @Module({ providers: [...] })
 * export class AppModule implements MiddlewareConfigurable {
 *   configure(consumer: MiddlewareConsumer): void {
 *     // Global logging middleware (excludes health check)
 *     consumer
 *       .apply(LoggingMiddleware)
 *       .exclude('/health')
 *       .forRoutes('*')
 *
 *     // CORS middleware for specific controllers
 *     consumer
 *       .apply(CorsMiddleware)
 *       .forRoutes(ApiController, WebhooksController)
 *
 *     // Rate limiting for auth endpoints
 *     consumer
 *       .apply(RateLimitMiddleware)
 *       .forRoutes({ path: '/api/v1/auth/*', method: 'post' })
 *   }
 * }
 * ```
 */
export class MiddlewareConsumerImpl implements IMiddlewareConsumer {
  private entries: MiddlewareConfigEntry[] = []

  /**
   * Start configuring middleware
   *
   * @param middlewares - Middleware classes to apply
   * @returns Builder for configuring routes and exclusions
   */
  apply(...middlewares: Constructor<Middleware>[]): IMiddlewareBuilder {
    return new MiddlewareBuilderImpl(middlewares, this)
  }

  /**
   * Add a configuration entry (called by builder)
   * @internal
   */
  addEntry(entry: MiddlewareConfigEntry): void {
    this.entries.push(entry)
  }

  /**
   * Get all configured middleware entries
   */
  getEntries(): MiddlewareConfigEntry[] {
    return this.entries
  }
}

/**
 * Create a new middleware consumer instance
 */
export function createMiddlewareConsumer(): IMiddlewareConsumer {
  return new MiddlewareConsumerImpl()
}
