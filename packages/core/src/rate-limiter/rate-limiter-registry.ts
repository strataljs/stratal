import { type Container, DI_TOKENS, inject } from '../di'
import { Singleton } from '../di/decorators'
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

/** What a distinct-value window stores, in place of `StoredHit`'s counter. */
interface StoredDistinct {
  values: string[]
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
// IMPORTANT: do not pass a token to @Singleton — that would self-register
// the class globally at module-load time, making the Registry resolvable
// even when the user never imported RateLimiterModule. We rely on
// RateLimiterModule providers being the only binding source, so
// `{ isOptional: true }` in ThrottleMiddleware correctly returns undefined
// when the module is missing.
@Singleton()
export class RateLimiterRegistry extends Macroable {
  private readonly resolvers = new Map<string, LimitResolver>()

  constructor(
    @inject(DI_TOKENS.Container) private readonly container: Container,
  ) {
    super()
  }

  /**
   * Resolve the store per access instead of capturing it at construction.
   * The registry is a singleton built during module init; lazy resolution
   * keeps later `RATE_LIMITER_TOKENS.Store` overrides (e.g. the testing
   * harness disabling limits) effective.
   */
  private get store(): IRateLimiterStore {
    return this.container.resolve<IRateLimiterStore>(RATE_LIMITER_TOKENS.Store)
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
      const key = this.makeKey(name, limit.windowSeconds, limit.key, limit.distinctValue !== undefined)
      const hit =
        limit.distinctValue === undefined
          ? await this.hit(key, limit.windowSeconds)
          : await this.hitDistinct(key, limit.windowSeconds, limit.distinctValue, limit.max)

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
      //
      // Stamped unconditionally: the cache decision is not on the response yet at this point in
      // the unwind, so whether these may be kept is decided by
      // `createNoStoreFallbackMiddleware`, which strips them from a shared-cacheable response.
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

  /**
   * A window that counts DISTINCT values rather than requests.
   *
   * Uses the same typed-KV store as {@link hit} — the store persists arbitrary values, so a
   * cardinality window needs no store-interface change — but a key namespace of its own, since
   * the two shapes are not interchangeable and a shared key would have each read the other's.
   *
   * A value already present is admitted WITHOUT a write, which both keeps the count stable and
   * leaves the TTL alone: re-touching something already counted must not slide the window. The
   * stored set therefore never exceeds `max`.
   *
   * The cap is a SOFT ceiling under an eventually-consistent store. This is a read-modify-write
   * of the whole array, so N concurrent requests carrying N different values all read the same
   * set and last-write-wins keeps one of them: a burst can overshoot `max`, and unlike a lost
   * counter increment (which the next request re-adds) a lost set member is gone for the rest of
   * the window. Intended for small caps — tens, not thousands; nothing bounds `max` itself, and
   * the whole set is read and rewritten on every new value. A hard cap needs a
   * strongly-consistent store, i.e. a Durable Object.
   */
  private async hitDistinct(
    key: string,
    windowSeconds: number,
    value: string,
    max: number,
  ): Promise<RateLimitHit> {
    const now = Date.now()
    const existing = await this.store.get<StoredDistinct>(key)

    if (existing && existing.resetAt > now) {
      if (existing.values.includes(value)) {
        return { count: existing.values.length, resetAt: existing.resetAt }
      }

      // A new value past the cap is refused WITHOUT being stored: persisting it would push the
      // stored count past `max` for every later request, including ones for values already
      // counted, which must stay admitted.
      if (existing.values.length >= max) {
        return { count: existing.values.length + 1, resetAt: existing.resetAt }
      }

      const values = [...existing.values, value]
      const ttlSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
      await this.store.set(key, { values, resetAt: existing.resetAt }, ttlSeconds)
      return { count: values.length, resetAt: existing.resetAt }
    }

    const resetAt = now + windowSeconds * 1000
    await this.store.set(key, { values: [value], resetAt }, Math.max(1, windowSeconds))
    return { count: 1, resetAt }
  }

  /**
   * Distinct windows carry a `d:` segment: they store `StoredDistinct` where a plain window
   * stores `StoredHit`, and one limiter name can legitimately declare both on the same window
   * and actor. Sharing a key would have each branch read the other's shape and throw.
   */
  private makeKey(
    name: string,
    windowSeconds: number,
    by: string | undefined,
    distinct: boolean,
  ): string {
    const actor = by ?? '*'
    return `rl:${name}:${distinct ? 'd:' : ''}${windowSeconds}:${actor}`
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
