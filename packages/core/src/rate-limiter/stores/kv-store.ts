import type { CacheService } from '../../cache/services/cache.service'
import type { IRateLimiterStore, RateLimitHit } from './rate-limiter-store.interface'

interface KvEntry {
  count: number
  resetAt: number
}

/**
 * Cloudflare KV-backed rate-limit store.
 *
 * Implements `hit()` as a get-modify-put cycle. KV has no native atomic
 * increment, so highly concurrent requests against the same key from
 * different edge locations may undercount. That's an inherent KV
 * tradeoff — pick `{ useClass: MyDurableObjectStore }` for strict
 * accuracy across edges.
 *
 * KV's minimum `expirationTtl` is 60 seconds; sub-60s windows are
 * still enforced by the algorithm via `resetAt`, but the key may live
 * in KV longer than the window.
 */
export class KvRateLimiterStore implements IRateLimiterStore {
  constructor(private readonly cache: CacheService) {}

  async hit(key: string, windowSeconds: number): Promise<RateLimitHit> {
    const now = Date.now()
    const existing = await this.cache.get<KvEntry>(key, 'json')

    let next: KvEntry
    if (!existing || existing.resetAt <= now) {
      next = { count: 1, resetAt: now + windowSeconds * 1000 }
    } else {
      next = { count: existing.count + 1, resetAt: existing.resetAt }
    }

    const ttlSeconds = Math.max(60, Math.ceil((next.resetAt - now) / 1000))
    await this.cache.put(key, JSON.stringify(next), { expirationTtl: ttlSeconds })

    return next
  }

  async reset(key: string): Promise<void> {
    await this.cache.delete(key)
  }
}
