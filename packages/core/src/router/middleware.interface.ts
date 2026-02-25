import type { RouterContext } from './router-context'

/**
 * Middleware interface for request processing
 *
 * Middlewares use the `@Transient()` decorator and are registered via
 * the `configure(consumer)` method in modules implementing `MiddlewareConfigurable`.
 *
 * @example
 * ```typescript
 * @Transient()
 * export class LoggingMiddleware implements Middleware {
 *   async handle(ctx: RouterContext, next: () => Promise<void>): Promise<void> {
 *     const start = Date.now()
 *     await next()
 *     console.log(`Request took ${Date.now() - start}ms`)
 *   }
 * }
 *
 * // Register in module:
 * @Module({ providers: [...] })
 * export class AppModule implements MiddlewareConfigurable {
 *   configure(consumer: MiddlewareConsumer): void {
 *     consumer.apply(LoggingMiddleware).forRoutes('*')
 *   }
 * }
 * ```
 */
export interface Middleware {
  /**
   * Handle middleware logic
   * Call next() to continue the middleware chain
   *
   * @param ctx - Router context with request/response helpers
   * @param next - Function to call the next middleware or route handler
   */
  handle(ctx: RouterContext, next: () => Promise<void>): Promise<void>
}
