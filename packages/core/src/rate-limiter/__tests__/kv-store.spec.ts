import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CacheService } from '../../cache/services/cache.service'
import { KvRateLimiterStore } from '../stores/kv-store'

describe('KvRateLimiterStore', () => {
  let cache: DeepMocked<CacheService>
  let store: KvRateLimiterStore

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    cache = createMock<CacheService>()
    store = new KvRateLimiterStore(cache as unknown as CacheService)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // CacheService.get is overloaded; DeepMocked picks the last overload (stream).
  // Cast through a narrower mock helper to avoid TS variance complaints.
  const mockGet = () => cache.get as unknown as {
    mockResolvedValue: (v: unknown) => void
  }

  it('writes count=1 and a future resetAt on first hit', async () => {
    mockGet().mockResolvedValue(null)

    const result = await store.hit('rl:test:60:user', 60)

    expect(result.count).toBe(1)
    expect(result.resetAt).toBe(Date.now() + 60_000)
    expect(cache.put).toHaveBeenCalledWith(
      'rl:test:60:user',
      JSON.stringify({ count: 1, resetAt: result.resetAt }),
      { expirationTtl: 60 },
    )
  })

  it('increments an existing entry without changing its resetAt', async () => {
    const existing = { count: 4, resetAt: Date.now() + 30_000 }
    mockGet().mockResolvedValue(existing)

    const result = await store.hit('rl:test:60:user', 60)

    expect(result.count).toBe(5)
    expect(result.resetAt).toBe(existing.resetAt)
    expect(cache.put).toHaveBeenCalledWith(
      'rl:test:60:user',
      JSON.stringify({ count: 5, resetAt: existing.resetAt }),
      // Remaining window is 30s but KV minimum is 60s.
      { expirationTtl: 60 },
    )
  })

  it('starts a fresh window when the previous one has elapsed', async () => {
    const expired = { count: 99, resetAt: Date.now() - 1 }
    mockGet().mockResolvedValue(expired)

    const result = await store.hit('rl:test:60:user', 60)

    expect(result.count).toBe(1)
    expect(result.resetAt).toBe(Date.now() + 60_000)
  })

  it('reset() delegates to cache.delete', async () => {
    await store.reset('rl:test:60:user')
    expect(cache.delete).toHaveBeenCalledWith('rl:test:60:user')
  })
})
