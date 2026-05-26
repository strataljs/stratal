export const RATE_LIMITER_TOKENS = {
  Registry: Symbol.for('stratal:rate-limiter:registry'),
  Store: Symbol.for('stratal:rate-limiter:store'),
  StoreFactory: Symbol.for('stratal:rate-limiter:store-factory'),
  Options: Symbol.for('stratal:rate-limiter:options'),
  /**
   * Per-app marker registered by RateLimiterModule.onInitialize. Used by
   * ThrottleMiddleware to detect "module not imported".
   */
  ModuleMarker: Symbol.for('stratal:rate-limiter:module-marker'),
} as const

export type RateLimiterToken = (typeof RATE_LIMITER_TOKENS)[keyof typeof RATE_LIMITER_TOKENS]
