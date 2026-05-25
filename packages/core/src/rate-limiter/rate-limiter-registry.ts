import { inject } from 'tsyringe'
import { Transient } from '../di/decorators'
import { Macroable } from '../macroable'
import type { Next } from '../router/middleware.interface'
import type { RouterContext } from '../router/router-context'
import { RateLimiterError, TooManyRequestsError } from './errors'
import type { Limit, RateLimitHeaders } from './limit'
import { RATE_LIMITER_TOKENS } from './rate-limiter.tokens'
import type { IRateLimiterStore, RateLimitHit } from './stores/rate-limiter-store.interface'

/**
 * Resolver function registered via {@link RateLimiterRegistry.for}. Receives
 * the request context and returns the limit (or limits) that apply to this
 * request. Return `Limit.none()` to bypass for the current request.
 */
export type LimitResolver = (
  ctx: RouterContext,
) => Limit | Limit[] | Promise<Limit | Limit[]>

interface StoredHit {
  count: number
  resetAt: number
}

/**
 * Central registry of named rate limiters and the request-time enforcement
 * pipeline. Resolved as a singleton; consumed by `ThrottleMiddleware`.
 *
 * Register limiters in a module's `onInitialize` hook:
 * ```typescript
 * @Module({})
 * export class RateLimitsModule implements OnInitialize {
 *   onInitialize({ container }: ModuleContext): void {
 *     const limiter = container.resolve<RateLimiterRegistry>(RATE_LIMITER_TOKENS.Registry)
 *     limiter.for('api', (ctx) => Limit.perMinute(60).by(ctx.header('cf-connecting-ip') ?? '*'))
 *   }
 * }
 * ```
 *
 * Extensible via `Macroable`: adapter packages (e.g. `@stratal/framework/auth`)
 * can attach extra registration methods such as `forPath()` for better-auth
 * `customRules` interop.
 */
// IMPORTANT: do not pass a token to @Transient — that would self-register
// the class globally at module-load time, making the Registry resolvable
// even when the user never imported RateLimiterModule. We rely on
// RateLimiterModule providers being the only binding source, so
// `{ isOptional: true }` in ThrottleMiddleware correctly returns undefined
// when the module is missing.
@Transient()
export class RateLimiterRegistry extends Macroable {
  private readonly resolvers = new Map<string, LimitResolver>()

  constructor(
    @inject(RATE_LIMITER_TOKENS.Store) private readonly store: IRateLimiterStore,
  ) {
    super()
  }

  /**
   * Register a named limiter. Names must be unique; calling `for()` again
   * with the same name overwrites the previous resolver (matches Laravel
   * `RateLimiter::for` semantics — last definition wins).
   */
  for(name: string, resolver: LimitResolver): void {
    this.resolvers.set(name, resolver)
  }

  has(name: string): boolean {
    return this.resolvers.has(name)
  }

  /**
   * Enforce the named limiter for the current request. Called by
   * `ThrottleMiddleware` (the per-name class produced by
   * `createThrottleMiddleware`). Resolves the limiter, increments the store
   * for each non-bypassed limit, sets `X-RateLimit-*` headers on success, and
   * either invokes the limit's custom `.response()` or throws
   * {@link TooManyRequestsError} when a limit is exceeded.
   */
  async handle(name: string, ctx: RouterContext, next: Next): Promise<Response | void> {
    const resolver = this.resolvers.get(name)
    if (!resolver) {
      throw new RateLimiterError(`Rate limiter "${name}" is not defined. Register it with limiter.for("${name}", ...) in a module's onInitialize hook.`)
    }

    const resolved = await resolver(ctx)
    const limits = Array.isArray(resolved) ? resolved : [resolved]
    const active = limits.filter((l) => !l.disabled)

    if (active.length === 0) {
      return next()
    }

    let mostRestrictive: { limit: Limit; remaining: number; resetAt: number } | undefined
    let exceeded: { limit: Limit; resetAt: number } | undefined

    for (const limit of active) {
      const key = this.makeKey(name, limit.windowSeconds, limit.key)
      const hit = await this.hit(key, limit.windowSeconds)

      if (hit.count > limit.max) {
        if (!exceeded || hit.resetAt > exceeded.resetAt) {
          exceeded = { limit, resetAt: hit.resetAt }
        }
        continue
      }

      const remaining = limit.max - hit.count
      if (!mostRestrictive || remaining < mostRestrictive.remaining) {
        mostRestrictive = { limit, remaining, resetAt: hit.resetAt }
      }
    }

    if (exceeded) {
      const headers = this.makeHeaders(exceeded.limit.max, 0, exceeded.resetAt)
      if (exceeded.limit.customResponse) {
        return exceeded.limit.customResponse(ctx, headers)
      }
      throw new TooManyRequestsError({
        retryAfter: Number(headers['Retry-After']),
        limit: exceeded.limit.max,
        resetAt: exceeded.resetAt,
      })
    }

    await next()

    if (mostRestrictive) {
      const headers = this.makeHeaders(
        mostRestrictive.limit.max,
        mostRestrictive.remaining,
        mostRestrictive.resetAt,
      )
      // Hono populates ctx.c.res after next() — same pattern as logger.middleware.ts.
      const downstream = ctx.c.res
      downstream.headers.set('X-RateLimit-Limit', headers['X-RateLimit-Limit'])
      downstream.headers.set('X-RateLimit-Remaining', headers['X-RateLimit-Remaining'])
      downstream.headers.set('X-RateLimit-Reset', headers['X-RateLimit-Reset'])
    }
  }

  /**
   * Get-modify-set increment over the typed KV store. Not atomic across
   * concurrent edge requests on KV — see `KvRateLimiterStore`'s caveat.
   */
  private async hit(key: string, windowSeconds: number): Promise<RateLimitHit> {
    const now = Date.now()
    const existing = await this.store.get<StoredHit>(key)

    let next: StoredHit
    if (!existing || existing.resetAt <= now) {
      next = { count: 1, resetAt: now + windowSeconds * 1000 }
    } else {
      next = { count: existing.count + 1, resetAt: existing.resetAt }
    }

    const ttlSeconds = Math.max(1, Math.ceil((next.resetAt - now) / 1000))
    await this.store.set(key, next, ttlSeconds)
    return next
  }

  private makeKey(name: string, windowSeconds: number, by: string | undefined): string {
    const actor = by ?? '*'
    return `rl:${name}:${windowSeconds}:${actor}`
  }

  private makeHeaders(limit: number, remaining: number, resetAt: number): RateLimitHeaders {
    const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
    return {
      'Retry-After': String(retryAfter),
      'X-RateLimit-Limit': String(limit),
      'X-RateLimit-Remaining': String(Math.max(0, remaining)),
      'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
    }
  }
}
