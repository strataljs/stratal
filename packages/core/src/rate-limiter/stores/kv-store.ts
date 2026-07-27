import type { CacheService } from '../../cache/services/cache.service'
import type { IRateLimiterStore } from './rate-limiter-store.interface'

/**
 * Cloudflare KV-backed typed KV store.
 *
 * KV's minimum `expirationTtl` is 60 seconds; sub-60s windows are still
 * enforced by the registry's algorithm via the persisted `resetAt`, but
 * the key itself may live in KV longer than the logical window.
 *
 * KV has no native atomic increment, so concurrent writes from different
 * edge locations may undercount under high contention. That's an inherent
 * KV tradeoff — pick `{ useClass: MyDurableObjectStore }` for strict
 * accuracy across edges.
 */
export class KvRateLimiterStore implements IRateLimiterStore {
  constructor(private readonly cache: CacheService) {}

  async get<T>(key: string): Promise<T | null> {
    return (await this.cache.get<T>(key, 'json')) ?? null
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const ttl = Math.max(60, Math.ceil(ttlSeconds))
    // `CacheService.put` defers the KV write via `waitUntil`, so this no longer
    // blocks the request on KV's central-store write latency.
    await this.cache.put(key, JSON.stringify(value), { expirationTtl: ttl })
  }

  async delete(key: string): Promise<void> {
    await this.cache.delete(key)
  }
}
