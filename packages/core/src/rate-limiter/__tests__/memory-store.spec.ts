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

  it('hit() returns count=1 and a future resetAt on first hit', async () => {
    const result = await store.hit('rl:test:60:user', 60)
    expect(result.count).toBe(1)
    expect(result.resetAt).toBe(Date.now() + 60_000)
  })

  it('hit() increments without resetting the window on subsequent hits', async () => {
    const first = await store.hit('rl:test:60:user', 60)
    vi.advanceTimersByTime(10_000)
    const second = await store.hit('rl:test:60:user', 60)
    const third = await store.hit('rl:test:60:user', 60)

    expect(second.count).toBe(2)
    expect(third.count).toBe(3)
    expect(second.resetAt).toBe(first.resetAt)
    expect(third.resetAt).toBe(first.resetAt)
  })

  it('hit() starts a fresh window after the previous one expires', async () => {
    const first = await store.hit('rl:test:60:user', 60)
    vi.advanceTimersByTime(60_001)
    const fresh = await store.hit('rl:test:60:user', 60)

    expect(fresh.count).toBe(1)
    expect(fresh.resetAt).toBeGreaterThan(first.resetAt)
  })

  it('reset() clears the bucket so the next hit starts fresh', async () => {
    await store.hit('rl:test:60:user', 60)
    await store.hit('rl:test:60:user', 60)
    await store.reset('rl:test:60:user')

    const next = await store.hit('rl:test:60:user', 60)
    expect(next.count).toBe(1)
  })

  it('keeps separate counters per key', async () => {
    await store.hit('rl:test:60:alice', 60)
    await store.hit('rl:test:60:alice', 60)
    const bob = await store.hit('rl:test:60:bob', 60)
    expect(bob.count).toBe(1)
  })
})
