import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CacheService } from '../services/cache.service'
import { TieredCacheService } from '../services/tiered-cache.service'

interface CacheMock {
  get: ReturnType<typeof vi.fn>
  put: ReturnType<typeof vi.fn>
  putDurable: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  list: ReturnType<typeof vi.fn>
  getWithMetadata: ReturnType<typeof vi.fn>
  binding: ReturnType<typeof vi.fn>
}

const makeCacheMock = (): CacheMock => ({
  get: vi.fn(),
  put: vi.fn().mockResolvedValue(undefined),
  putDurable: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
  list: vi.fn(),
  getWithMetadata: vi.fn(),
  binding: vi.fn(),
})

describe('TieredCacheService', () => {
  let cache: CacheMock
  let tiered: TieredCacheService

  beforeEach(() => {
    vi.clearAllMocks()
    cache = makeCacheMock()
    tiered = new TieredCacheService(cache as unknown as CacheService)
  })

  describe('isolate-local L1', () => {
    it('serves a written value from L1 without reading KV', async () => {
      await tiered.put('k', 'v')
      const result = await tiered.get('k')

      expect(result).toBe('v')
      expect(cache.put).toHaveBeenCalledWith('k', 'v', undefined)
      expect(cache.get).not.toHaveBeenCalled()
    })

    it('putDurable writes through the durable L2 path and populates L1', async () => {
      await tiered.putDurable('k', 'v', { expirationTtl: 60 })
      const result = await tiered.get('k')

      expect(result).toBe('v')
      expect(cache.putDurable).toHaveBeenCalledWith('k', 'v', { expirationTtl: 60 })
      expect(cache.put).not.toHaveBeenCalled()
      expect(cache.get).not.toHaveBeenCalled()
    })

    it('parses json from the L1 string written by put', async () => {
      await tiered.put('k', JSON.stringify({ a: 1 }))
      const result = await tiered.get<{ a: number }>('k', 'json')

      expect(result).toEqual({ a: 1 })
      expect(cache.get).not.toHaveBeenCalled()
    })

    it('back-populates L1 from a text read so the next read skips KV', async () => {
      cache.get.mockResolvedValue('from-kv')

      const first = await tiered.get('k')
      const second = await tiered.get('k')

      expect(first).toBe('from-kv')
      expect(second).toBe('from-kv')
      expect(cache.get).toHaveBeenCalledTimes(1)
    })

    it('does not back-populate L1 from a json read (no raw string)', async () => {
      cache.get.mockResolvedValue({ a: 1 })

      await tiered.get('k', 'json')
      await tiered.get('k', 'json')

      expect(cache.get).toHaveBeenCalledTimes(2)
    })

    it('invalidates L1 on delete so the next read falls through to KV', async () => {
      cache.get.mockResolvedValue(null)

      await tiered.put('k', 'v')
      await tiered.delete('k')
      const result = await tiered.get('k')

      expect(result).toBeNull()
      expect(cache.delete).toHaveBeenCalledWith('k')
      expect(cache.get).toHaveBeenCalledWith('k', undefined)
    })

    it('expires an L1 entry past its TTL and falls through to KV', async () => {
      vi.useFakeTimers()
      try {
        cache.get.mockResolvedValue('fresh-from-kv')

        await tiered.put('k', 'stale', { expirationTtl: 60 })
        vi.advanceTimersByTime(61_000)
        const result = await tiered.get('k')

        expect(result).toBe('fresh-from-kv')
      } finally {
        vi.useRealTimers()
      }
    })

    it('does not cache binary writes in L1', async () => {
      cache.get.mockResolvedValue('from-kv')

      await tiered.put('k', new ArrayBuffer(8))
      const result = await tiered.get('k')

      expect(result).toBe('from-kv')
      expect(cache.get).toHaveBeenCalledWith('k', undefined)
    })
  })

  describe('KV-direct passthrough', () => {
    it('delegates list to the underlying cache', async () => {
      const listResult = { keys: [], list_complete: true }
      cache.list.mockResolvedValue(listResult)

      const result = await tiered.list({ prefix: 'p:' })

      expect(result).toBe(listResult)
      expect(cache.list).toHaveBeenCalledWith({ prefix: 'p:' })
    })

    it('delegates getWithMetadata to the underlying cache', async () => {
      const meta = { value: 'v', metadata: { a: 1 }, cacheStatus: null }
      cache.getWithMetadata.mockResolvedValue(meta)

      const result = await tiered.getWithMetadata('k')

      expect(result).toBe(meta)
      expect(cache.getWithMetadata).toHaveBeenCalledWith('k', undefined)
    })
  })

  describe('binding()', () => {
    it('memoizes a tiered instance per binding name', () => {
      cache.binding.mockReturnValue(makeCacheMock())

      const a = tiered.binding('OTHER')
      const b = tiered.binding('OTHER')

      expect(a).toBeInstanceOf(TieredCacheService)
      expect(a).toBe(b)
      // Resolved once and reused — the L1 persists across calls.
      expect(cache.binding).toHaveBeenCalledTimes(1)
    })

    it('routes operations through the bound namespace with its own L1', async () => {
      const childCache = makeCacheMock()
      childCache.get.mockResolvedValue('from-child')
      cache.binding.mockReturnValue(childCache)

      const child = tiered.binding('OTHER')
      const result = await child.get('k')

      expect(result).toBe('from-child')
      expect(childCache.get).toHaveBeenCalledWith('k', undefined)
      // The root's own L1/KV is untouched.
      expect(cache.get).not.toHaveBeenCalled()
    })
  })
})
