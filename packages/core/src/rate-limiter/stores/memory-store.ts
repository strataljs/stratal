import type { IRateLimiterStore } from './rate-limiter-store.interface'

interface Entry {
  value: unknown
  expiresAt: number
}

/**
 * In-process Map-backed typed KV store.
 *
 * Suitable for tests and single-isolate scenarios. Not safe across
 * Cloudflare Worker isolates — entries reset whenever a fresh isolate
 * spins up. Use `KvRateLimiterStore` (or a custom Durable Object store)
 * for production. Expiry is lazy: stale entries are dropped on the next
 * `get`.
 */
export class InMemoryRateLimiterStore implements IRateLimiterStore {
  private readonly entries = new Map<string, Entry>()

  get<T>(key: string): Promise<T | null> {
    const entry = this.entries.get(key)
    if (!entry) return Promise.resolve(null)
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key)
      return Promise.resolve(null)
    }
    return Promise.resolve(entry.value as T)
  }

  set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
    return Promise.resolve()
  }

  delete(key: string): Promise<void> {
    this.entries.delete(key)
    return Promise.resolve()
  }
}
