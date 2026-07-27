import { describe, expect, it, vi } from 'vitest'
import { createPoolFactory, DB_SHARED_POOL_ENV } from '../pool'

describe('createPoolFactory', () => {
  it('returns a FRESH pool per call by default (dev/staging/prod)', async () => {
    const make = vi.fn(() => ({ end: vi.fn() }))
    const factory = createPoolFactory({}, make)
    const a = await factory()
    const b = await factory()
    expect(make).toHaveBeenCalledTimes(2)
    expect(a).not.toBe(b)
  })

  it('memoizes ONE shared pool per connection when DB_SHARED_POOL_ENV is set', async () => {
    const make = vi.fn(() => ({ end: vi.fn() }))
    const factory = createPoolFactory({ [DB_SHARED_POOL_ENV]: 'true' }, make)
    const a = await factory()
    const b = await factory()
    expect(make).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
  })

  it('makes the SHARED pool end() idempotent — the socket tears down once across many disconnects', async () => {
    // Every @Transient DatabaseClient shares this one pool, so disposeInstances
    // calls end() once per live instance. pg-pool throws "Called end on pool more
    // than once" on the 2nd+ raw call; the factory must collapse them to one.
    const underlyingEnd = vi.fn().mockResolvedValue(undefined)
    const factory = createPoolFactory({ [DB_SHARED_POOL_ENV]: 'true' }, () => ({ end: underlyingEnd }))
    const pool = (await factory()) as { end: () => Promise<unknown> }
    await Promise.all([pool.end(), pool.end(), pool.end()])
    await pool.end()
    expect(underlyingEnd).toHaveBeenCalledTimes(1)
  })

  it('does NOT wrap fresh (non-shared) pools — each is ended on its own', async () => {
    const ends: ReturnType<typeof vi.fn>[] = []
    const factory = createPoolFactory({}, () => {
      const end = vi.fn().mockResolvedValue(undefined)
      ends.push(end)
      return { end }
    })
    const p1 = (await factory()) as { end: () => Promise<unknown> }
    const p2 = (await factory()) as { end: () => Promise<unknown> }
    await p1.end()
    await p2.end()
    expect(ends[0]).toHaveBeenCalledTimes(1)
    expect(ends[1]).toHaveBeenCalledTimes(1)
  })
})
