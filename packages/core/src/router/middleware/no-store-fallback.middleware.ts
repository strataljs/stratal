import type { MiddlewareHandler } from 'hono'
import { PER_CALLER_RATE_LIMIT_HEADERS } from '../../rate-limiter/limit'
import { isSharedCacheable, setResponseHeaders } from '../../response-cache/response-headers'
import type { RouterEnv } from '../types'

const NO_STORE = 'private, no-store'

/** `{ 'X-RateLimit-Limit': null, … }` — the delete form `setResponseHeaders` takes. */
const DROP_PER_CALLER_HEADERS = Object.fromEntries(
  PER_CALLER_RATE_LIMIT_HEADERS.map((name) => [name, null]),
) as Record<string, string | null>

/**
 * The single outermost safety net behind Stratal's caching-decision
 * guarantee: every response leaving a Stratal app carries an explicit
 * `Cache-Control` header. Workers Caching applies RFC 9111 heuristic
 * freshness to anything that doesn't — a header-less `200` is cached for two
 * hours (§4.2.1), and `404`/`405`/`410`/`501` are heuristically cacheable too
 * (§4.2.2), same for a redirect like the trailing-slash `308`.
 *
 * `RouteRegistrationService.applyCacheDecision` already stamps a decision for
 * every ordinary controller response — `@Cacheable` routes get their computed
 * headers, everything else is left alone for this middleware to catch. This
 * is the backstop for everything that path never sees: thrown errors (404s,
 * 500s rendered by the exception handler), guard/scoped-middleware
 * short-circuits (`wrapHandlerWithChain` returning a middleware's `Response`
 * directly), the trailing-slash redirect, wildcard/`@All` controller routes,
 * and any future response path that forgets to call it.
 *
 * Registered as the very first global middleware, so it wraps everything
 * else. Hono's `compose()` fully resolves a thrown error or a middleware
 * short-circuit into `context.res` at the layer where it happens, then
 * returns *normally* to every middleware further out — the same guarantee
 * `createLoggerMiddleware` already depends on to log the right status for a
 * 404. By the time `next()` resolves here, `c.res` holds the final response,
 * whichever code path produced it.
 */
export function createNoStoreFallbackMiddleware(): MiddlewareHandler<RouterEnv> {
  return async (c, next) => {
    await next()

    if (!c.res.headers.has('Cache-Control')) {
      const stamped = setResponseHeaders(c.res, { 'Cache-Control': NO_STORE })
      // Only reassign `c.res` when a new object was actually produced —
      // Hono's `res` setter merges the *previous* `c.res`'s headers onto
      // whatever is assigned, so reassigning the same (in-place-mutated)
      // object would immediately re-clone it for nothing.
      if (stamped !== c.res) c.res = stamped
    }

    // `X-RateLimit-*` describe one caller's remaining budget, so they must not survive on a
    // response a shared cache may store: the entry is replayed to every other caller, and a cache
    // hit never runs the throttle middleware, so the figure counts down for nobody.
    //
    // This is the only layer where the cache decision is already on the response — it is stamped
    // inside the route handler, and Hono's `res` setter merges headers as the chain unwinds, so a
    // middleware testing `Cache-Control` after its own `next()` races the header it depends on.
    //
    // The limit is still consumed and enforced; only the reporting is withheld.
    if (isSharedCacheable(c.res)) {
      const stripped = setResponseHeaders(c.res, DROP_PER_CALLER_HEADERS)
      if (stripped !== c.res) c.res = stripped
    }
  }
}
