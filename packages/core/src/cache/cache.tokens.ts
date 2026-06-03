export const CACHE_TOKENS = {
  CacheService: Symbol.for('stratal:cache:service'),
  TieredCacheService: Symbol.for('stratal:cache:tiered-service'),
} as const

export type CacheToken = (typeof CACHE_TOKENS)[keyof typeof CACHE_TOKENS]
