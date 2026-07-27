import { SessionVerificationMiddleware } from './middleware/session-verification.middleware'

/**
 * Middleware the response-cache gateway must run before resolving partitions.
 *
 * `ctx.user()` reads the request-scoped `AuthContext`, which
 * `SessionVerificationMiddleware` populates. The gateway runs outside the
 * app's middleware chain, so without this a partition resolver calling
 * `ctx.user()` would throw `UserNotAuthenticatedError` on every request.
 *
 * Pass it alongside `gateway: { entrypoint }` — `primers` without a configured
 * gateway is a boot error, because nothing would ever run the middleware
 * listed here.
 *
 * The cost lands in the primer, not the accessor: `ctx.user()` is a memory
 * read, while `SessionVerificationMiddleware` calls
 * `authService.auth.api.getSession()`. On a cache **miss** that call happens
 * twice — once in the gateway to resolve the partition, once in the app's own
 * chain, since each runs in its own request scope. On a **hit** the app never
 * runs, so only the gateway's single call is paid.
 *
 * @example
 * ```typescript
 * ResponseCacheModule.forRoot({
 *   gateway: { entrypoint: 'Cached' },
 *   primers: AUTH_GATEWAY_PRIMERS,
 *   partitions: { user: (ctx) => ctx.user().id },
 * })
 * ```
 */
export const AUTH_GATEWAY_PRIMERS = [SessionVerificationMiddleware] as const
