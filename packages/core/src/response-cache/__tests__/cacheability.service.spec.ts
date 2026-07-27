import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CacheabilityService } from '../services/cacheability.service'
import type { ResolvedCacheable } from '../types'

const logger = { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() }

const resolved: ResolvedCacheable = {
  ttl: 300,
  swr: 60,
  tags: ['post-list'],
  partitionBy: [],
  vary: ['X-Inertia'],
}

const scopes = { param: {}, query: {}, body: undefined, data: undefined }
const ok = { partitionsResolved: true }

describe('CacheabilityService', () => {
  let service: CacheabilityService

  beforeEach(() => {
    vi.clearAllMocks()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow logger stub
    service = new CacheabilityService(logger as any)
  })

  it('emits Cache-Control, Cache-Tag, and Vary for a cacheable response', () => {
    const result = service.apply(new Response('hi', { status: 200 }), resolved, scopes, ok)
    expect(result.headers.get('Cache-Control')).toBe('public, max-age=300, stale-while-revalidate=60')
    expect(result.headers.get('Cache-Tag')).toBe('post-list')
    expect(result.headers.get('Vary')).toBe('X-Inertia')
  })

  it('omits stale-while-revalidate when no swr is set', () => {
    const result = service.apply(new Response('hi'), { ...resolved, swr: undefined }, scopes, ok)
    expect(result.headers.get('Cache-Control')).toBe('public, max-age=300')
  })

  it('unions Vary with a value the response already carries', () => {
    const response = new Response('hi', { headers: { Vary: 'Accept' } })
    const result = service.apply(response, resolved, scopes, ok)
    expect(result.headers.get('Vary')?.split(', ').sort()).toEqual(['Accept', 'X-Inertia'])
  })

  it('fails closed when the response sets a cookie', () => {
    const response = new Response('hi', { headers: { 'Set-Cookie': 'session=abc' } })
    const result = service.apply(response, resolved, scopes, ok)
    expect(result.headers.get('Cache-Control')).toBe('private, no-store')
    expect(result.headers.get('Cache-Tag')).toBeNull()
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('not cached'),
      expect.objectContaining({ reason: 'set-cookie' }),
    )
  })

  it('fails closed on a non-2xx status', () => {
    const result = service.apply(new Response('nope', { status: 404 }), resolved, scopes, ok)
    expect(result.headers.get('Cache-Control')).toBe('private, no-store')
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ reason: 'status' }))
  })

  it('fails closed when a partition could not be resolved', () => {
    const result = service.apply(new Response('hi'), resolved, scopes, { partitionsResolved: false })
    expect(result.headers.get('Cache-Control')).toBe('private, no-store')
    expect(result.headers.get('Cache-Tag')).toBeNull()
    expect(logger.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ reason: 'partition-unresolved' }),
    )
  })

  it('fails closed when Inertia flash data is present', () => {
    const result = service.apply(new Response('hi'), resolved, scopes, {
      partitionsResolved: true,
      inertia: { hasFlash: true, isPartial: false, hasOnceProps: false },
    })
    expect(result.headers.get('Cache-Control')).toBe('private, no-store')
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ reason: 'inertia-flash' }))
  })

  it('fails closed on an Inertia partial reload', () => {
    const result = service.apply(new Response('hi'), resolved, scopes, {
      partitionsResolved: true,
      inertia: { hasFlash: false, isPartial: true, hasOnceProps: false },
    })
    expect(result.headers.get('Cache-Control')).toBe('private, no-store')
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ reason: 'inertia-partial' }))
  })

  it('fails closed when the page carries a once() prop', () => {
    const result = service.apply(new Response('hi'), resolved, scopes, {
      partitionsResolved: true,
      inertia: { hasFlash: false, isPartial: false, hasOnceProps: true },
    })
    expect(result.headers.get('Cache-Control')).toBe('private, no-store')
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ reason: 'inertia-once' }))
  })

  it('renders interpolated tags', () => {
    const result = service.apply(
      new Response('hi'),
      { ...resolved, tags: ['post:{param.slug}'] },
      { ...scopes, param: { slug: 'hello' } },
      ok,
    )
    expect(result.headers.get('Cache-Tag')).toBe('post:hello')
  })

  it('joins multiple tags with a comma', () => {
    const result = service.apply(new Response('hi'), { ...resolved, tags: ['a', 'b'] }, scopes, ok)
    expect(result.headers.get('Cache-Tag')).toBe('a,b')
  })

  it('fails closed when a tag template is malformed', () => {
    const result = service.apply(
      new Response('hi'),
      { ...resolved, tags: ['post:{query.tenant}'] },
      scopes, // query.tenant not provided
      ok,
    )
    expect(result.headers.get('Cache-Control')).toBe('private, no-store')
    expect(result.headers.get('Cache-Tag')).toBeNull()
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Invalid cache tag'),
      expect.objectContaining({ error: expect.any(Error) }),
    )
  })
})
