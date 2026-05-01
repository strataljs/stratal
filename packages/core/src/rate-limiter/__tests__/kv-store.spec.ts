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

  it('get() returns null for a missing key', async () => {
    mockGet().mockResolvedValue(null)
    expect(await store.get('rl:test')).toBeNull()
    expect(cache.get).toHaveBeenCalledWith('rl:test', 'json')
  })

  it('get<T>() returns the parsed value', async () => {
    const stored = { count: 5, resetAt: Date.now() + 30_000 }
    mockGet().mockResolvedValue(stored)
    expect(await store.get<typeof stored>('rl:test')).toEqual(stored)
  })

  it('set() JSON-stringifies the value and forwards expirationTtl', async () => {
    const value = { count: 1, resetAt: Date.now() + 60_000 }
    await store.set('rl:test', value, 60)

    expect(cache.put).toHaveBeenCalledWith(
      'rl:test',
      JSON.stringify(value),
      { expirationTtl: 60 },
    )
  })

  it('set() clamps TTL to KV minimum of 60 seconds', async () => {
    await store.set('rl:test', { count: 1, resetAt: Date.now() + 5_000 }, 5)
    expect(cache.put).toHaveBeenCalledWith(
      'rl:test',
      expect.any(String),
      { expirationTtl: 60 },
    )
  })

  it('set() rounds fractional TTL up before clamping', async () => {
    await store.set('rl:test', 'v', 90.2)
    expect(cache.put).toHaveBeenCalledWith(
      'rl:test',
      expect.any(String),
      { expirationTtl: 91 },
    )
  })

  it('delete() delegates to cache.delete', async () => {
    await store.delete('rl:test')
    expect(cache.delete).toHaveBeenCalledWith('rl:test')
  })
})
