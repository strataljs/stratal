import { inject } from '../di'
import { CONTAINER_TOKEN, type Container } from '../di'
import { Transient } from '../di/decorators'
import type { Middleware, Next } from '../router/middleware.interface'
import type { RouterContext } from '../router/router-context'
import type { Constructor } from '../types'
import { RateLimiterError } from './errors'
import type { RateLimiterRegistry } from './rate-limiter-registry'
import { RATE_LIMITER_TOKENS } from './rate-limiter.tokens'

const cache = new Map<string, Constructor<Middleware>>()

/**
 * Memoized factory that produces a Stratal `Middleware` class bound to a
 * named limiter. Calling twice with the same name returns the *same* class
 * — important for `Router.middleware` deduplication via class identity.
 *
 * Detection of "module not imported" works against a per-app marker
 * registered by `RateLimiterModule.onInitialize` (NOT via inject decorator,
 * because tsyringe would still try to construct Registry — whose Store
 * inject would explode with a less-actionable tsyringe wrapping). We hold
 * the user's container, then check `isRegistered(marker, recursive=true)`
 * at request time before resolving Registry.
 */
export function createThrottleMiddleware(name: string): Constructor<Middleware> {
  const existing = cache.get(name)
  if (existing) return existing

  @Transient()
  class ThrottleMiddleware implements Middleware {
    constructor(
      @inject(CONTAINER_TOKEN) private readonly container: Container,
    ) {}

    handle(ctx: RouterContext, next: Next): Promise<Response | void> {
      if (!this.container.isRegistered(RATE_LIMITER_TOKENS.ModuleMarker)) {
        throw new RateLimiterError(`RateLimiterModule was not imported. Cannot resolve throttle "${name}". Import RateLimiterModule.forRoot({ store: ... }) in your AppModule.`)
      }
      const registry = this.container.resolve<RateLimiterRegistry>(RATE_LIMITER_TOKENS.Registry)
      return registry.handle(name, ctx, next)
    }
  }

  Object.defineProperty(ThrottleMiddleware, 'name', { value: `Throttle(${name})` })
  cache.set(name, ThrottleMiddleware)
  return ThrottleMiddleware
}

/**
 * Test-only escape hatch: clear the per-name middleware class cache.
 * Production code never needs this.
 */
export function _resetThrottleMiddlewareCache(): void {
  cache.clear()
}
