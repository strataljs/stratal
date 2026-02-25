export const CACHE_TOKENS = {
  CacheService: Symbol.for('CacheService'),
} as const

export type CacheToken = (typeof CACHE_TOKENS)[keyof typeof CACHE_TOKENS]
