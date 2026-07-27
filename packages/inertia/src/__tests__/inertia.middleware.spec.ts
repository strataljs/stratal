import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono, type Context } from 'hono'
import { RouterContext } from 'stratal/router'
import type { RouterEnv } from 'stratal/router'
import type { InertiaModuleOptions } from '../inertia.options'
import { InertiaMiddleware } from '../middleware/inertia.middleware'

function createMockContext(overrides: {
  url?: string
  method?: string
  headers?: Record<string, string>
  resStatus?: number
} = {}): { ctx: RouterContext; c: Record<string, unknown> } {
  const headers = new Headers(overrides.headers ?? {})

  const c = {
    req: {
      url: overrides.url ?? 'http://localhost/',
      method: overrides.method ?? 'GET',
      header: (name: string) => headers.get(name) ?? undefined,
    },
    get: vi.fn(),
    set: vi.fn(),
    header: vi.fn(),
    status: vi.fn(),
    // `headers` matters: the middleware now reads the response's existing
    // `Vary` so it can union rather than clobber it.
    res: { status: overrides.resStatus ?? 200, headers: new Headers() },
  }

  return { ctx: new RouterContext(c as unknown as Context), c }
}

describe('InertiaMiddleware', () => {
  let middleware: InertiaMiddleware
  const options: InertiaModuleOptions = {
    rootView: '<html></html>',
    version: '1.0',
  }

  beforeEach(() => {
    middleware = new InertiaMiddleware(options)
  })

  it('should set inertia context variables', async () => {
    const { ctx, c } = createMockContext({
      headers: { 'x-inertia': 'true', 'purpose': 'prefetch' },
    })

    await middleware.handle(ctx, vi.fn())

    expect(c.set).toHaveBeenCalledWith('inertia', true)
    expect(c.set).toHaveBeenCalledWith('inertiaPrefetch', true)
  })

  it('should set inertia to false for non-Inertia requests', async () => {
    const { ctx, c } = createMockContext()

    await middleware.handle(ctx, vi.fn())

    expect(c.set).toHaveBeenCalledWith('inertia', false)
    expect(c.set).toHaveBeenCalledWith('inertiaPrefetch', false)
  })

  it('should add Vary header to all responses', async () => {
    const { ctx, c } = createMockContext()

    await middleware.handle(ctx, vi.fn())

    expect(c.header).toHaveBeenCalledWith('Vary', 'X-Inertia')
  })

  it('should return 409 on version mismatch for GET requests', async () => {
    const { ctx, c } = createMockContext({
      headers: { 'x-inertia': 'true', 'x-inertia-version': 'old-version' },
    })

    const next = vi.fn()
    await middleware.handle(ctx, next)

    expect(c.status).toHaveBeenCalledWith(409)
    expect(c.header).toHaveBeenCalledWith('X-Inertia-Location', 'http://localhost/')
    expect(next).not.toHaveBeenCalled()
  })

  it('should not check version for non-GET requests', async () => {
    const { ctx, c } = createMockContext({
      method: 'POST',
      headers: { 'x-inertia': 'true', 'x-inertia-version': 'old-version' },
    })

    const next = vi.fn()
    await middleware.handle(ctx, next)

    expect(next).toHaveBeenCalled()
    expect(c.status).not.toHaveBeenCalledWith(409)
  })

  it('should convert 302 to 303 for non-GET Inertia requests', async () => {
    const { ctx, c } = createMockContext({
      method: 'PUT',
      headers: { 'x-inertia': 'true' },
      resStatus: 302,
    })

    await middleware.handle(ctx, vi.fn())

    expect(c.status).toHaveBeenCalledWith(303)
  })

  it('should not convert 302 for GET requests', async () => {
    const { ctx, c } = createMockContext({
      method: 'GET',
      headers: { 'x-inertia': 'true' },
      resStatus: 302,
    })

    await middleware.handle(ctx, vi.fn())

    expect(c.status).not.toHaveBeenCalledWith(303)
  })

  describe('Vary is unioned, never replaced', () => {
    /**
     * A real Hono pipeline, because the bug this covers only exists in the
     * ordering: `applyCacheDecision` stamps `@Cacheable`'s `vary: [...]` from
     * *inside* the route handler, and this middleware's outbound half runs
     * after it. `c.header('Vary', 'X-Inertia')` is a set, not an append, so
     * the previous implementation silently dropped the route's declared Vary
     * names and collapsed every variant (every `Accept-Language`) onto a
     * single cache entry.
     */
    function appVarying(...names: string[]) {
      const app = new Hono<RouterEnv>()

      app.use('*', async (c, next) => {
        const inertia = new InertiaMiddleware(options)
        await inertia.handle(new RouterContext(c), next)
      })

      app.get('/', (c) => {
        // Stand-in for `applyCacheDecision` → `CacheabilityService.apply`.
        if (names.length > 0) c.header('Vary', names.join(', '))
        c.header('Cache-Control', 'public, max-age=300')
        return c.json({ ok: true })
      })

      return app
    }

    it('keeps a Vary name the handler already stamped', async () => {
      const res = await appVarying('Accept-Language').request('/')

      const vary = (res.headers.get('Vary') ?? '').split(',').map((v) => v.trim())
      expect(vary).toContain('X-Inertia')
      expect(vary).toContain('Accept-Language')
      // Documented in references/response-cache.md as exactly this value.
      expect(res.headers.get('Vary')).toBe('X-Inertia, Accept-Language')
      // The rest of the cache decision is untouched.
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=300')
    })

    it('keeps several handler-stamped Vary names', async () => {
      const res = await appVarying('Accept-Language', 'Accept-Encoding').request('/')

      expect(res.headers.get('Vary')).toBe('X-Inertia, Accept-Language, Accept-Encoding')
    })

    it('still emits X-Inertia when the handler stamped no Vary at all', async () => {
      const res = await appVarying().request('/')

      expect(res.headers.get('Vary')).toBe('X-Inertia')
    })

    it('does not duplicate X-Inertia when the route already declared it', async () => {
      const res = await appVarying('X-Inertia', 'Accept-Language').request('/')

      expect(res.headers.get('Vary')).toBe('X-Inertia, Accept-Language')
    })

    it('matches an existing X-Inertia case-insensitively', async () => {
      const res = await appVarying('x-inertia').request('/')

      expect(res.headers.get('Vary')).toBe('x-inertia')
    })
  })
})
