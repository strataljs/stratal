/**
 * Result of a single hit against a rate-limit store.
 */
export interface RateLimitHit {
  /** Counter value AFTER the increment (1 on first hit). */
  count: number
  /** Absolute reset timestamp in milliseconds since epoch. */
  resetAt: number
}

/**
 * Pluggable backend for rate-limit counters.
 *
 * Implementations decide how to atomically (or near-atomically) increment a
 * counter and expire it after `windowSeconds`. The framework ships
 * `KvRateLimiterStore` (Cloudflare KV) and `InMemoryRateLimiterStore`
 * (tests). Users can register a custom implementation through
 * `RateLimiterModule.forRoot({ store: { useClass: ... } })` — useful for
 * Durable Objects, Redis, or any other backing store.
 */
export interface IRateLimiterStore {
  /**
   * Increment the counter for `key`, creating it with `windowSeconds` TTL on
   * the first hit. Subsequent hits within the window must increment the
   * existing value without resetting the TTL.
   *
   * @returns The post-increment count and absolute reset timestamp (ms epoch).
   */
  hit(key: string, windowSeconds: number): Promise<RateLimitHit>

  /**
   * Clear the counter for `key`. Used by `RateLimiterRegistry.clear()` for
   * operational unblocking.
   */
  reset(key: string): Promise<void>
}
