export const RATE_LIMITER_TOKENS = {
  Registry: Symbol.for('stratal:rate-limiter:registry'),
  Store: Symbol.for('stratal:rate-limiter:store'),
  StoreFactory: Symbol.for('stratal:rate-limiter:store-factory'),
  Options: Symbol.for('stratal:rate-limiter:options'),
  /**
   * Per-app marker registered by RateLimiterModule.onInitialize. Used by
   * ThrottleMiddleware to detect "module not imported" — the @Module
   * decorator globally registers providers via tsyringe's registry(),
   * so the Registry/Store tokens are globally bound the moment the module
   * file is loaded. The only way to confirm the module was actually wired
   * into the *user's* AppModule is to look for an artifact registered
   * inside the user's app container (not the root container).
   */
  ModuleMarker: Symbol.for('stratal:rate-limiter:module-marker'),
} as const

export type RateLimiterToken = (typeof RATE_LIMITER_TOKENS)[keyof typeof RATE_LIMITER_TOKENS]
