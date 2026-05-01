// Public API for the rate-limiter module.
//
// Users typically import from this entry point:
//   import { RateLimiterModule, RateLimit, Limit, RATE_LIMITER_TOKENS } from 'stratal/rate-limiter'

export {
  RateLimiterModuleNotImportedError,
  RateLimiterNotConfiguredError,
  RateLimiterNotDefinedError,
  TooManyRequestsError,
} from './errors'
export { Limit, type RateLimitHeaders, type RateLimitResponseHandler } from './limit'
export { RateLimiterRegistry, type LimitResolver } from './rate-limiter-registry'
export { RateLimiterModule } from './rate-limiter.module'
export { RATE_LIMITER_TOKENS, type RateLimiterToken } from './rate-limiter.tokens'
export { _resetThrottleMiddlewareCache, createThrottleMiddleware } from './throttle.middleware'

// Decorators
export { getRateLimits, RateLimit } from './decorators'

// Stores
export { KvRateLimiterStore } from './stores/kv-store'
export { InMemoryRateLimiterStore } from './stores/memory-store'
export type { IRateLimiterStore, RateLimitHit } from './stores/rate-limiter-store.interface'
export { RateLimiterStoreFactory, type RateLimiterModuleOptions } from './stores/store-factory'
