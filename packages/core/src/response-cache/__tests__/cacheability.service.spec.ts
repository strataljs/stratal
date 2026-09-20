import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CacheabilityService } from '../services/cacheability.service'
import type { ResolvedCacheable, ResponseCacheModuleOptions } from '../types'

const logger = { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() }

/**
 * A response may only be cached when everything it varies on is in the cache
 * key, so every case that expects caching to succeed has to declare the names
 * its `Vary` will carry.
 */
function serviceKeyedOn(...keyBy: string[]): CacheabilityService {
  const options: ResponseCacheModuleOptions = { gateway: { entrypoint: 'Cached', keyBy } }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow logger stub
  return new CacheabilityService(logger as any, options)
}

const resolved: ResolvedCacheable = {
  ttl: 300,
  browserTtl: 300,
  swr: 60,
  tags: ['post-list'],
  partitionBy: [],
  vary: ['X-Inertia'],
}

const scopes = { param: {}, query: {}, body: undefined, data: undefined, partition: {} }
const ok = { partitionsResolved: true }

describe('CacheabilityService', () => {
  let service: CacheabilityService

  beforeEach(() => {
    vi.clearAllMocks()
    service = serviceKeyedOn('X-Inertia')
  })

  it('emits Cache-Control, Cache-Tag, and Vary for a cacheable response', () => {
    const result = service.apply(new Response('hi', { status: 200 }), resolved, scopes, ok)
    expect(result.headers.get('Cache-Control')).toBe('public, max-age=300, stale-while-revalidate=60')
    expect(result.headers.get('CDN-Cache-Control')).toBe('public, max-age=300, stale-while-revalidate=60')
    expect(result.headers.get('Cache-Tag')).toBe('post-list')
    expect(result.headers.get('Vary')).toBe('X-Inertia')
  })

  it('lets the browser hold the response for as long as the shared cache may', () => {
    // The default: a route that says nothing about browsers gets the lifetime
    // it already gave the shared cache, so a repeat visit is answered from the
    // visitor's own copy rather than over the network.
    const result = service.apply(new Response('hi'), resolved, scopes, ok)
    expect(result.headers.get('Cache-Control')).toBe('public, max-age=300, stale-while-revalidate=60')
  })

  it('makes the browser ask every time when the route gives it no lifetime', () => {
    // `browserTtl: 0` with no stale window is a route whose retraction has to
    // be reliable: a purge cannot reach a browser copy, so there must not be
    // one to reach.
    const result = service.apply(new Response('hi'), { ...resolved, browserTtl: 0, swr: undefined }, scopes, ok)
    expect(result.headers.get('Cache-Control')).toBe('public, max-age=0, must-revalidate')
    expect(result.headers.get('CDN-Cache-Control')).toBe('public, max-age=300')
  })

  it('lets a retractable response still paint from the browser copy while it revalidates', () => {
    // `browserTtl: 0` plus a stale window: nothing is served as fresh, so the
    // browser always checks — but it paints what it has instead of waiting,
    // and a purge lands on the next navigation rather than after the full ttl.
    const result = service.apply(new Response('hi'), { ...resolved, browserTtl: 0 }, scopes, ok)
    expect(result.headers.get('Cache-Control')).toBe('public, max-age=0, stale-while-revalidate=60')
  })

  it('never pairs must-revalidate with a stale window it contradicts', () => {
    // `must-revalidate` forbids serving stale at all, which is precisely what
    // `stale-while-revalidate` asks for. Emitting both leaves the two halves of
    // one header disagreeing.
    const result = service.apply(new Response('hi'), { ...resolved, browserTtl: 0 }, scopes, ok)
    expect(result.headers.get('Cache-Control')).not.toContain('must-revalidate')
  })

  it('omits stale-while-revalidate when no swr is set', () => {
    const result = service.apply(new Response('hi'), { ...resolved, swr: undefined }, scopes, ok)
    expect(result.headers.get('Cache-Control')).toBe('public, max-age=300')
    expect(result.headers.get('CDN-Cache-Control')).toBe('public, max-age=300')
  })

  it('strips a CDN-Cache-Control the handler set when it fails closed', () => {
    // Cloudflare reads `CDN-Cache-Control` in preference to `Cache-Control`, so
    // one left on a refused response caches it at the edge under the very
    // lifetime this decision withheld — the `private, no-store` beside it would
    // be honoured by the browser and ignored by the cache that matters.
    const response = new Response('hi', {
      headers: { 'Set-Cookie': 'a=1', 'CDN-Cache-Control': 'public, max-age=86400' },
    })

    const result = service.apply(response, resolved, scopes, ok)

    expect(result.headers.get('Cache-Control')).toBe('private, no-store')
    expect(result.headers.get('CDN-Cache-Control')).toBeNull()
  })

  it('unions Vary with a value the response already carries', () => {
    const response = new Response('hi', { headers: { Vary: 'Accept' } })
    const result = serviceKeyedOn('X-Inertia', 'Accept').apply(response, resolved, scopes, ok)
    expect(result.headers.get('Vary')?.split(', ').sort()).toEqual(['Accept', 'X-Inertia'])
  })

  it('fails closed when the response varies on a header the cache key does not carry', () => {
    // The defect this guards: `Vary` alone does not keep two representations of
    // one URL in separate entries, so a response keyed on less than it varies
    // on can be handed to a request that asked for the other representation.
    const result = serviceKeyedOn().apply(new Response('hi'), resolved, scopes, ok)

    expect(result.headers.get('Cache-Control')).toBe('private, no-store')
    expect(result.headers.get('Cache-Tag')).toBeNull()
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ reason: 'vary-unkeyed' }))
  })

  it('names the unkeyed headers and how to key them', () => {
    serviceKeyedOn().apply(new Response('hi'), resolved, scopes, ok)

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('x-inertia'), expect.objectContaining({ vary: ['x-inertia'] }))
  })

  it('leaves an app with no gateway alone, having nothing to offer it instead', () => {
    // Without a loopback there is no `ctx.props` to put a representation in, so
    // refusing here would withdraw caching and supply no way to get it back.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow logger stub
    const ungated = new CacheabilityService(logger as any, {})
    const result = ungated.apply(new Response('hi'), resolved, scopes, ok)

    expect(result.headers.get('Cache-Control')).toBe('public, max-age=300, stale-while-revalidate=60')
    expect(result.headers.get('CDN-Cache-Control')).toBe('public, max-age=300, stale-while-revalidate=60')
  })

  it('caches a response varying only on Accept-Encoding, which the platform keys itself', () => {
    const response = new Response('hi', { headers: { Vary: 'Accept-Encoding' } })
    const result = serviceKeyedOn().apply(response, { ...resolved, vary: [] }, scopes, ok)

    expect(result.headers.get('Cache-Control')).toBe('public, max-age=300, stale-while-revalidate=60')
    expect(result.headers.get('CDN-Cache-Control')).toBe('public, max-age=300, stale-while-revalidate=60')
  })

  it('fails closed when the response sets a cookie', () => {
    const response = new Response('hi', { headers: { 'Set-Cookie': 'session=abc' } })
    const result = service.apply(response, resolved, scopes, ok)
    expect(result.headers.get('Cache-Control')).toBe('private, no-store')
    expect(result.headers.get('Cache-Tag')).toBeNull()
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('not cached'), expect.objectContaining({ reason: 'set-cookie' }))
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
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ reason: 'partition-unresolved' }))
  })

  it('fails closed when Inertia flash data is present', () => {
    const result = service.apply(new Response('hi'), resolved, scopes, {
      partitionsResolved: true,
      inertia: { hasFlash: true, isPartial: false, hasOnceProps: false, varyHeaders: ['X-Inertia'] },
    })
    expect(result.headers.get('Cache-Control')).toBe('private, no-store')
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ reason: 'inertia-flash' }))
  })

  it('caches an Inertia partial reload, keyed on the headers that select its props', () => {
    const result = serviceKeyedOn('X-Inertia', 'X-Inertia-Partial-Data').apply(new Response('hi'), resolved, scopes, {
      partitionsResolved: true,
      inertia: {
        hasFlash: false,
        isPartial: true,
        hasOnceProps: false,
        varyHeaders: ['X-Inertia', 'X-Inertia-Partial-Data'],
      },
    })
    expect(result.headers.get('Cache-Control')).toBe('public, max-age=300, stale-while-revalidate=60')
    expect(result.headers.get('CDN-Cache-Control')).toBe('public, max-age=300, stale-while-revalidate=60')
    expect(result.headers.get('Vary')?.split(', ').sort()).toEqual(['X-Inertia', 'X-Inertia-Partial-Data'])
  })

  it('unions the adapter Vary names into one that the route declared', () => {
    const keyed = serviceKeyedOn('X-Inertia', 'X-Inertia-Reset', 'Accept')
    const result = keyed.apply(new Response('hi', { headers: { Vary: 'Accept' } }), resolved, scopes, {
      partitionsResolved: true,
      inertia: {
        hasFlash: false,
        isPartial: false,
        hasOnceProps: false,
        varyHeaders: ['X-Inertia', 'X-Inertia-Reset'],
      },
    })
    expect(result.headers.get('Vary')?.split(', ').sort()).toEqual(['Accept', 'X-Inertia', 'X-Inertia-Reset'])
  })

  it('fails closed on a partial reload the adapter did not report Vary headers for', () => {
    const result = service.apply(new Response('hi'), resolved, scopes, {
      partitionsResolved: true,
      inertia: { hasFlash: false, isPartial: true, hasOnceProps: false, varyHeaders: [] },
    })
    expect(result.headers.get('Cache-Control')).toBe('private, no-store')
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ reason: 'inertia-partial-unkeyed' }))
  })

  it('fails closed when the page carries a once() prop', () => {
    const result = service.apply(new Response('hi'), resolved, scopes, {
      partitionsResolved: true,
      inertia: { hasFlash: false, isPartial: false, hasOnceProps: true, varyHeaders: ['X-Inertia'] },
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
