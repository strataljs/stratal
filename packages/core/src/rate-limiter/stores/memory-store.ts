import type { IRateLimiterStore, RateLimitHit } from './rate-limiter-store.interface'

interface MemoryEntry {
  count: number
  resetAt: number
}

/**
 * In-process Map-backed rate-limit store.
 *
 * Suitable for tests and single-isolate scenarios. Not safe across
 * Cloudflare Worker isolates — counts reset whenever a fresh isolate
 * spins up. Use `KvRateLimiterStore` (or a custom Durable Object store)
 * for production.
 */
export class InMemoryRateLimiterStore implements IRateLimiterStore {
  private readonly entries = new Map<string, MemoryEntry>()

  hit(key: string, windowSeconds: number): Promise<RateLimitHit> {
    const now = Date.now()
    const existing = this.entries.get(key)

    if (!existing || existing.resetAt <= now) {
      const fresh: MemoryEntry = { count: 1, resetAt: now + windowSeconds * 1000 }
      this.entries.set(key, fresh)
      return Promise.resolve({ count: fresh.count, resetAt: fresh.resetAt })
    }

    existing.count += 1
    return Promise.resolve({ count: existing.count, resetAt: existing.resetAt })
  }

  reset(key: string): Promise<void> {
    this.entries.delete(key)
    return Promise.resolve()
  }
}
