import type { RouterContext } from './router-context';

/**
 * The continuation passed to a {@link Middleware}. Calling it runs the rest of
 * the chain (the next middleware, then the route handler).
 *
 * It resolves to a short-circuit `Response` when a downstream middleware
 * returns one, or `void` otherwise — wider than Hono's own `Next` (which is
 * typed `Promise<void>`) so a forwarding middleware can `return next()` to
 * propagate a downstream short-circuit without an unsafe cast.
 */
export type Next = () => Promise<Response | void>;

/**
 * Middleware interface for request processing
 *
 * Middlewares use the `@Transient()` decorator and are registered via
 * `configureRoutes(router)` in modules implementing `RouteConfigurable`.
 *
 * @example
 * ```typescript
 * @Transient()
 * export class LoggingMiddleware implements Middleware {
 *   async handle(ctx: RouterContext, next: Next): Promise<void> {
 *     const start = Date.now()
 *     await next()
 *     console.log(`Request took ${Date.now() - start}ms`)
 *   }
 * }
 *
 * // Register in module:
 * @Module({ providers: [LoggingMiddleware] })
 * export class AppModule implements RouteConfigurable {
 *   configureRoutes(router: Router): void {
 *     router.middleware(LoggingMiddleware)
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
  handle(ctx: RouterContext, next: Next): Promise<Response | void>
}
