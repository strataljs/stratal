import { describe, expect, it } from 'vitest'
import { ResponseCacheConfigError } from '../errors'
import { resolveCacheable } from '../resolve-cacheable'

const ctx = { controller: 'PostsController', method: 'index', guarded: false }

describe('resolveCacheable', () => {
  it('applies module defaults to a bare @Cacheable', () => {
    const result = resolveCacheable({}, { ttl: 300, swr: 60, partitionBy: ['user'] }, ctx)
    expect(result).toEqual({ ttl: 300, swr: 60, tags: [], partitionBy: ['user'], vary: [] })
  })

  it('lets route options override scalar defaults', () => {
    const result = resolveCacheable({ ttl: 60 }, { ttl: 300, swr: 60 }, ctx)
    expect(result.ttl).toBe(60)
    expect(result.swr).toBe(60)
  })

  it('replaces partitionBy rather than merging it', () => {
    const result = resolveCacheable({ ttl: 60, partitionBy: ['role'] }, { partitionBy: ['user'] }, ctx)
    expect(result.partitionBy).toEqual(['role'])
  })

  it('treats an explicit empty partitionBy as public', () => {
    const result = resolveCacheable({ ttl: 60, partitionBy: [] }, { partitionBy: ['user'] }, ctx)
    expect(result.partitionBy).toEqual([])
  })

  it('unions vary values without duplicates', () => {
    const result = resolveCacheable({ ttl: 60, vary: ['Accept'] }, { vary: ['X-Inertia', 'Accept'] }, ctx)
    expect(result.vary.sort()).toEqual(['Accept', 'X-Inertia'])
  })

  it('never defaults tags', () => {
    expect(resolveCacheable({}, { ttl: 300 }, ctx).tags).toEqual([])
  })

  it('throws when no ttl is available from either source', () => {
    expect(() => resolveCacheable({}, {}, ctx)).toThrow(ResponseCacheConfigError)
  })

  it('throws when a guarded route resolves to an empty partitionBy', () => {
    expect(() =>
      resolveCacheable({ ttl: 60 }, {}, { ...ctx, guarded: true }),
    ).toThrow(ResponseCacheConfigError)
  })

  it('throws when a guarded route explicitly declares itself public', () => {
    expect(() =>
      resolveCacheable({ ttl: 60, partitionBy: [] }, { partitionBy: ['user'] }, { ...ctx, guarded: true }),
    ).toThrow(ResponseCacheConfigError)
  })

  it('allows a guarded route that inherits a default partition', () => {
    const result = resolveCacheable({ ttl: 60 }, { partitionBy: ['user'] }, { ...ctx, guarded: true })
    expect(result.partitionBy).toEqual(['user'])
  })

  it('lets route options override swr defaults', () => {
    const result = resolveCacheable({ ttl: 60, swr: 10 }, { swr: 300 }, ctx)
    expect(result.swr).toBe(10)
  })

  it('accepts a swr of exactly 0 (meaning no stale window)', () => {
    const result = resolveCacheable({ ttl: 60, swr: 0 }, {}, ctx)
    expect(result.swr).toBe(0)
  })

  it('throws when swr is negative', () => {
    expect(() => resolveCacheable({ ttl: 60, swr: -1 }, {}, ctx)).toThrow(ResponseCacheConfigError)
  })

  it('throws when swr is NaN', () => {
    expect(() => resolveCacheable({ ttl: 60, swr: NaN }, {}, ctx)).toThrow(ResponseCacheConfigError)
  })

  it('throws when ttl is zero', () => {
    expect(() => resolveCacheable({ ttl: 0 }, {}, ctx)).toThrow(ResponseCacheConfigError)
  })

  it('throws when ttl is not finite', () => {
    expect(() => resolveCacheable({ ttl: Infinity }, {}, ctx)).toThrow(ResponseCacheConfigError)
  })

  it('propagates route tags to the result', () => {
    const result = resolveCacheable({ ttl: 60, tags: ['post:1'] }, {}, ctx)
    expect(result.tags).toEqual(['post:1'])
  })
})
