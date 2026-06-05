import type { IRateLimiterStore } from 'stratal/rate-limiter'

/**
 * Rate-limit store that never persists, so every read misses and every
 * counter restarts at 1 — rate limits are effectively disabled.
 *
 * Auto-registered by the testing module builder: integration suites fire
 * many requests from one "IP" in seconds, which would trip production
 * limiter budgets (and Better Auth's built-in per-path limits, which share
 * this store via the framework bridge). Suites that want to test limiting
 * behavior can override `RATE_LIMITER_TOKENS.Store` back to a real store.
 */
export class NoopRateLimiterStore implements IRateLimiterStore {
  get<T = unknown>(_key: string): Promise<T | null> {
    return Promise.resolve(null)
  }

  set<T = unknown>(_key: string, _value: T, _ttlSeconds: number): Promise<void> {
    // intentionally dropped
    return Promise.resolve()
  }

  delete(_key: string): Promise<void> {
    // nothing persisted, nothing to delete
    return Promise.resolve()
  }
}
