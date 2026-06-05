/**
 * Result of a single hit against the rate limiter (registry-internal).
 *
 * The store no longer participates in the increment — it's a typed KV.
 * `RateLimiterRegistry.handle()` produces this value as it runs the
 * get-modify-set sequence.
 */
export interface RateLimitHit {
  /** Counter value AFTER the increment (1 on first hit). */
  count: number
  /** Absolute reset timestamp in milliseconds since epoch. */
  resetAt: number
}

/**
 * Pluggable backend for rate-limit storage — a typed key-value store with TTL.
 *
 * The framework ships `KvRateLimiterStore` (Cloudflare KV) and
 * `InMemoryRateLimiterStore` (tests). Users can register a custom
 * implementation through `RateLimiterModule.forRoot({ store: { useClass: ... } })`.
 *
 * The increment logic lives in `RateLimiterRegistry`; the store only persists
 * arbitrary values keyed by string. Same shape consumed by the better-auth
 * bridge in `@stratal/framework/auth`, which stores its own `RateLimit`
 * records here under a separate key namespace.
 */
export interface IRateLimiterStore {
  /**
   * Read the value at `key`. Returns `null` when missing or expired.
   * Implementations are responsible for honouring TTL (lazy or active).
   */
  get<T = unknown>(key: string): Promise<T | null>

  /**
   * Write `value` at `key` with `ttlSeconds` TTL. Overwrites any existing
   * value. The TTL resets on every write — callers compute the remaining
   * window themselves and pass it explicitly.
   */
  set<T = unknown>(key: string, value: T, ttlSeconds: number): Promise<void>

  /**
   * Remove `key`. No-op when missing.
   */
  delete(key: string): Promise<void>
}
