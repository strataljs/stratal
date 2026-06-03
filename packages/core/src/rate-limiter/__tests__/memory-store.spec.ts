import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InMemoryRateLimiterStore } from '../stores/memory-store'

describe('InMemoryRateLimiterStore', () => {
  let store: InMemoryRateLimiterStore

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    store = new InMemoryRateLimiterStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null for missing keys', async () => {
    expect(await store.get('missing')).toBeNull()
  })

  it('round-trips a typed value with TTL', async () => {
    await store.set('k', { count: 3, resetAt: Date.now() + 60_000 }, 60)
    const value = await store.get<{ count: number; resetAt: number }>('k')
    expect(value).toEqual({ count: 3, resetAt: Date.now() + 60_000 })
  })

  it('expires entries lazily on get after the TTL elapses', async () => {
    await store.set('k', 'hello', 30)
    expect(await store.get('k')).toBe('hello')

    vi.advanceTimersByTime(30_001)
    expect(await store.get('k')).toBeNull()
  })

  it('overwrites the value and resets the TTL on subsequent set()', async () => {
    await store.set('k', 'a', 30)
    vi.advanceTimersByTime(20_000)
    await store.set('k', 'b', 30)

    vi.advanceTimersByTime(20_000)
    expect(await store.get('k')).toBe('b')
  })

  it('delete() drops the entry immediately', async () => {
    await store.set('k', 'v', 60)
    await store.delete('k')
    expect(await store.get('k')).toBeNull()
  })

  it('keeps separate values per key', async () => {
    await store.set('a', 1, 60)
    await store.set('b', 2, 60)
    expect(await store.get('a')).toBe(1)
    expect(await store.get('b')).toBe(2)
  })
})
