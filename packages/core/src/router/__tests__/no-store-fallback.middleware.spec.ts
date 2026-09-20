import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { createNoStoreFallbackMiddleware } from '../middleware/no-store-fallback.middleware'
import type { RouterEnv } from '../types'

/**
 * A real Hono app, because the guarantee under test is about WHERE this
 * middleware sits: `c.res` only holds the final response once every inner
 * layer has unwound, and a hand-built context would not reproduce that.
 */
function appReturning(headers: Record<string, string>) {
  const app = new Hono<RouterEnv>()

  app.use('*', createNoStoreFallbackMiddleware())
  app.get('/', (c) => c.json({ ok: true }, 200, headers))

  return app
}

const RATE_LIMIT = {
  'X-RateLimit-Limit': '30',
  'X-RateLimit-Remaining': '29',
  'X-RateLimit-Reset': '1788255280',
}

describe('createNoStoreFallbackMiddleware', () => {
  it('stamps no-store on a response that carries no decision of its own', async () => {
    const res = await appReturning({}).request('/')

    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('leaves an explicit decision alone', async () => {
    const res = await appReturning({ 'Cache-Control': 'public, max-age=300' }).request('/')

    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300')
  })

  describe('per-caller rate-limit headers', () => {
    it('strips them from a response a shared cache may store', async () => {
      // They describe ONE caller's budget. Cached, they are replayed to everyone else — and the
      // throttle middleware does not run on a hit, so the figure counts down for nobody.
      const res = await appReturning({
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=600',
        ...RATE_LIMIT,
      }).request('/')

      expect(res.headers.get('X-RateLimit-Limit')).toBeNull()
      expect(res.headers.get('X-RateLimit-Remaining')).toBeNull()
      expect(res.headers.get('X-RateLimit-Reset')).toBeNull()
      // The decision itself is untouched.
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600, stale-while-revalidate=600')
    })

    it('strips them from an s-maxage response, which is equally shared', async () => {
      const res = await appReturning({ 'Cache-Control': 's-maxage=600', ...RATE_LIMIT }).request('/')

      expect(res.headers.get('X-RateLimit-Remaining')).toBeNull()
    })

    it('strips them when only CDN-Cache-Control makes the response shared', async () => {
      // A CDN reads `CDN-Cache-Control` in preference to `Cache-Control`, so
      // this response is stored and replayed to other callers however private
      // the header beside it reads. Judged on `Cache-Control` alone, one
      // caller's remaining budget would go to everybody the CDN serves.
      const res = await appReturning({
        'Cache-Control': 'private, max-age=0',
        'CDN-Cache-Control': 'public, max-age=600',
        ...RATE_LIMIT,
      }).request('/')

      expect(res.headers.get('X-RateLimit-Remaining')).toBeNull()
    })

    it('keeps them on a private response, which no shared cache stores', async () => {
      const res = await appReturning({
        'Cache-Control': 'private, no-store',
        ...RATE_LIMIT,
      }).request('/')

      expect(res.headers.get('X-RateLimit-Remaining')).toBe('29')
    })

    it('keeps them on a response this middleware itself stamped no-store', async () => {
      const res = await appReturning(RATE_LIMIT).request('/')

      expect(res.headers.get('Cache-Control')).toBe('private, no-store')
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('29')
    })

    it('is not fooled by "public" appearing inside another directive', async () => {
      const res = await appReturning({
        'Cache-Control': 'private, no-cache="public"',
        ...RATE_LIMIT,
      }).request('/')

      expect(res.headers.get('X-RateLimit-Remaining')).toBe('29')
    })

    it('leaves Retry-After alone, which rides a 429 and is about when, not who', async () => {
      const app = new Hono<RouterEnv>()
      app.use('*', createNoStoreFallbackMiddleware())
      app.get('/', (c) => c.json({ ok: false }, 429, { 'Cache-Control': 'public, max-age=60', 'Retry-After': '30' }))

      const res = await app.request('/')

      expect(res.headers.get('Retry-After')).toBe('30')
    })
  })
})
