import { describe, expect, it } from 'vitest'
import { ResponseCacheConfigError } from '../errors'
import { bindRouteCache } from '../services/route-cache-binding'

const ctx = { controller: 'PostsController', method: 'index', guarded: false }

describe('bindRouteCache', () => {
  it('returns undefined when the route declares neither decorator', () => {
    expect(bindRouteCache(undefined, undefined, {}, ctx)).toBeUndefined()
  })

  it('resolves a cacheable route against module defaults', () => {
    const bound = bindRouteCache({ ttl: 300 }, undefined, { swr: 60 }, ctx)
    expect(bound?.cacheable).toEqual({
      ttl: 300, swr: 60, tags: [], partitionBy: [], vary: [],
    })
  })

  it('carries the purge spec through', () => {
    const bound = bindRouteCache(undefined, { tags: ['post-list'] }, {}, ctx)
    expect(bound?.purges).toEqual({ tags: ['post-list'] })
  })

  it('throws when a route declares a non-empty partitionBy and no gateway is configured', () => {
    expect(() => bindRouteCache({ ttl: 300, partitionBy: ['user'] }, undefined, {}, ctx))
      .toThrow(ResponseCacheConfigError)
  })

  it('throws when module defaults supply a non-empty partitionBy and no gateway is configured', () => {
    expect(() => bindRouteCache({ ttl: 300 }, undefined, { partitionBy: ['user'] }, ctx))
      .toThrow(ResponseCacheConfigError)
  })

  it('names the gateway requirement in the partitionBy error so the author is not left guessing', () => {
    expect(() => bindRouteCache({ ttl: 300, partitionBy: ['user'] }, undefined, {}, ctx))
      .toThrow(/requires a gateway entrypoint/i)
  })

  it('accepts a route-declared partitionBy once a gateway entrypoint is configured', () => {
    const bound = bindRouteCache(
      { ttl: 300, partitionBy: ['user'] },
      undefined,
      {},
      { ...ctx, gatewayConfigured: true },
    )
    expect(bound?.cacheable?.partitionBy).toEqual(['user'])
  })

  it('accepts a defaults-supplied partitionBy once a gateway entrypoint is configured', () => {
    const bound = bindRouteCache(
      { ttl: 300 },
      undefined,
      { partitionBy: ['tenant'] },
      { ...ctx, gatewayConfigured: true },
    )
    expect(bound?.cacheable?.partitionBy).toEqual(['tenant'])
  })

  it('caches a guarded route once it is partitioned and a gateway is configured', () => {
    const bound = bindRouteCache(
      { ttl: 300, partitionBy: ['user'] },
      undefined,
      {},
      { ...ctx, guarded: true, gatewayConfigured: true },
    )
    expect(bound?.cacheable?.partitionBy).toEqual(['user'])
  })

  it('still rejects an explicitly public guarded route even with a gateway configured', () => {
    // `partitionBy: []` on a guarded route is the exact mistake the rule
    // exists to catch — honouring it would collapse every caller onto one
    // cache entry for a response that varies by caller.
    expect(() => bindRouteCache(
      { ttl: 300, partitionBy: [] },
      undefined,
      {},
      { ...ctx, guarded: true, gatewayConfigured: true },
    )).toThrow(/needs a non-empty `partitionBy`/)
  })

  it('allows an explicitly empty partitionBy on an unguarded route', () => {
    expect(bindRouteCache({ ttl: 300, partitionBy: [] }, undefined, {}, ctx)?.cacheable?.partitionBy)
      .toEqual([])
  })

  it('still rejects @Cacheable on a guarded route', () => {
    expect(() => bindRouteCache({ ttl: 300 }, undefined, {}, { ...ctx, guarded: true }))
      .toThrow(ResponseCacheConfigError)
  })

  it('throws when an @Cacheable tag uses the {body.*} scope', () => {
    expect(() => bindRouteCache({ ttl: 300, tags: ['item:{body.id}'] }, undefined, {}, ctx))
      .toThrow(ResponseCacheConfigError)
  })

  it('names the route, the offending tag, and why in the @Cacheable {body.*} error', () => {
    expect(() => bindRouteCache({ ttl: 300, tags: ['item:{body.id}'] }, undefined, {}, ctx))
      .toThrow(/PostsController\.index.*item:\{body\.id\}.*not available/is)
  })

  it('throws when a @PurgesCache tag uses the {body.*} scope', () => {
    expect(() => bindRouteCache(undefined, { tags: ['item:{body.id}'] }, {}, ctx))
      .toThrow(ResponseCacheConfigError)
  })

  it('names the route, the offending tag, and why in the @PurgesCache {body.*} error', () => {
    expect(() => bindRouteCache(undefined, { tags: ['item:{body.id}'] }, {}, ctx))
      .toThrow(/PostsController\.index.*item:\{body\.id\}.*not available/is)
  })

  it('throws on a {body.*} fan-out tag too', () => {
    expect(() => bindRouteCache(undefined, { tags: ['item:{body.ids.*}'] }, {}, ctx))
      .toThrow(ResponseCacheConfigError)
  })

  it('does not reject {param.*}, {query.*}, or {data.*} tags', () => {
    expect(bindRouteCache(
      { ttl: 300, tags: ['item:{param.id}', 'q:{query.tenant}', 'd:{data.categoryId}'] },
      undefined,
      {},
      ctx,
    )?.cacheable?.tags).toEqual(['item:{param.id}', 'q:{query.tenant}', 'd:{data.categoryId}'])
  })

  describe('{param.X} static resolvability', () => {
    it('does not validate {param.*} tags when routeParams is not supplied', () => {
      // `ctx` (module-level fixture) carries no `routeParams` — callers that
      // don't know the route's path opt out of this check entirely, rather
      // than every {param.*} tag being treated as unresolvable.
      expect(bindRouteCache({ ttl: 300, tags: ['item:{param.id}'] }, undefined, {}, ctx)?.cacheable?.tags)
        .toEqual(['item:{param.id}'])
    })

    it('allows a {param.X} tag whose X is a real path param', () => {
      const withParams = { ...ctx, routeParams: ['id'] }
      expect(bindRouteCache({ ttl: 300, tags: ['item:{param.id}'] }, undefined, {}, withParams)?.cacheable?.tags)
        .toEqual(['item:{param.id}'])
    })

    it('throws when an @Cacheable {param.X} tag has no matching :X in the route path', () => {
      const withParams = { ...ctx, routeParams: ['slug'] }
      expect(() => bindRouteCache({ ttl: 300, tags: ['item:{param.id}'] }, undefined, {}, withParams))
        .toThrow(ResponseCacheConfigError)
    })

    it('names the route, the tag, and the available params in the @Cacheable error', () => {
      const withParams = { ...ctx, routeParams: ['slug'] }
      expect(() => bindRouteCache({ ttl: 300, tags: ['item:{param.id}'] }, undefined, {}, withParams))
        .toThrow(/PostsController\.index.*item:\{param\.id\}.*slug/is)
    })

    it('throws when a @PurgesCache {param.X} tag has no matching :X in the route path', () => {
      const withParams = { ...ctx, routeParams: [] }
      expect(() => bindRouteCache(undefined, { tags: ['item:{param.id}'] }, {}, withParams))
        .toThrow(ResponseCacheConfigError)
    })

    it('reports "(none)" when the route declares no params at all', () => {
      const withParams = { ...ctx, routeParams: [] }
      expect(() => bindRouteCache(undefined, { tags: ['item:{param.id}'] }, {}, withParams))
        .toThrow(/\(none\)/)
    })

    it('allows a {param.X} tag when X is among several route params', () => {
      const withParams = { ...ctx, routeParams: ['companyId', 'id'] }
      expect(bindRouteCache(undefined, { tags: ['item:{param.id}'] }, {}, withParams)?.purges?.tags)
        .toEqual(['item:{param.id}'])
    })
  })
})
