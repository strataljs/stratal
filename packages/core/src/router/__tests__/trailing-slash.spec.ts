import type { MiddlewareHandler } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Application, type ApplicationOptions } from '../../application'
import type { StratalEnv } from '../../env'
import { boolean, object, string } from 'zod/mini'
import { LogLevel } from '../../logger'
import { Module } from '../../module/module.decorator'
import { Controller } from '../decorators/controller.decorator'
import { Route } from '../decorators/route.decorator'
import { createTrailingSlashRedirect } from '../middleware/trailing-slash-redirect'
import type { RouterContext } from '../router-context'

const handlerHits = { index: 0, create: 0 }

@Controller('/users')
class UsersController {
  @Route({ response: object({ ok: boolean() }) })
  index(ctx: RouterContext) {
    handlerHits.index += 1
    return ctx.json({ ok: true })
  }

  @Route({
    body: object({ name: string() }),
    response: object({ created: boolean() }),
  })
  create(ctx: RouterContext) {
    handlerHits.create += 1
    return ctx.json({ created: true }, 201)
  }
}

@Controller('/callback')
class CallbackController {
  @Route({ response: object({ ok: boolean() }) })
  index(ctx: RouterContext) {
    return ctx.json({ ok: true })
  }
}

@Module({ controllers: [UsersController, CallbackController] })
class TrailingSlashModule { }

const mockEnv = { ENVIRONMENT: 'test' } as StratalEnv
const mockCtx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
} as unknown as ExecutionContext

function createApp(overrides?: Partial<ApplicationOptions>) {
  return new Application({
    module: TrailingSlashModule,
    logging: { level: LogLevel.ERROR },
    env: mockEnv,
    ctx: { waitUntil: vi.fn() },
    ...overrides,
  })
}

async function fetchPath(app: Application, path: string, init?: RequestInit) {
  const hono = await app.ensureHono()
  return hono.fetch(new Request(`http://localhost${path}`, init), mockEnv, mockCtx)
}

describe('trailing-slash handling', () => {
  beforeEach(() => {
    handlerHits.index = 0
    handlerHits.create = 0
  })

  describe("mode 'ignore' (default)", () => {
    let app: Application

    beforeEach(async () => {
      app = createApp()
      await app.initialize()
    })

    afterEach(async () => {
      await app.shutdown()
    })

    it('matches the non-trailing form', async () => {
      const res = await fetchPath(app, '/users')
      expect(res.status).toBe(200)
      expect(handlerHits.index).toBe(1)
    })

    it('matches the trailing form against the same handler', async () => {
      const res = await fetchPath(app, '/users/')
      expect(res.status).toBe(200)
      expect(handlerHits.index).toBe(1)
    })

    it('does not redirect either form', async () => {
      const a = await fetchPath(app, '/users')
      const b = await fetchPath(app, '/users/')
      expect(a.status).toBe(200)
      expect(b.status).toBe(200)
    })
  })

  describe("mode 'always'", () => {
    let app: Application

    beforeEach(async () => {
      app = createApp({ trailingSlash: 'always' })
      await app.initialize()
    })

    afterEach(async () => {
      await app.shutdown()
    })

    it('redirects non-trailing requests to the trailing form with 308', async () => {
      const res = await fetchPath(app, '/users')
      expect(res.status).toBe(308)
      expect(res.headers.get('Location')).toBe('/users/')
      expect(handlerHits.index).toBe(0)
    })

    it('serves trailing-form requests directly', async () => {
      const res = await fetchPath(app, '/users/')
      expect(res.status).toBe(200)
      expect(handlerHits.index).toBe(1)
    })

    it('preserves query strings on redirect', async () => {
      const res = await fetchPath(app, '/users?page=2&sort=name')
      expect(res.status).toBe(308)
      expect(res.headers.get('Location')).toBe('/users/?page=2&sort=name')
    })

    it('uses a path-relative Location to avoid scheme mismatches behind proxies', async () => {
      const res = await fetchPath(app, '/users')
      const location = res.headers.get('Location')
      expect(location).toBe('/users/')
      // No absolute URL (no scheme) so the browser resolves against the
      // current page URI — sidesteps mixed-content blocks when the worker
      // is behind an HTTPS-terminating proxy serving HTTP internally.
      expect(location?.startsWith('http')).toBe(false)
    })

    it('uses 308 so POST bodies survive the redirect', async () => {
      const res = await fetchPath(app, '/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'jane' }),
      })
      expect(res.status).toBe(308)
      expect(res.headers.get('Location')).toBe('/users/')
      expect(handlerHits.create).toBe(0)
    })

    it('does not redirect file-like paths (last segment contains a dot)', async () => {
      const res = await fetchPath(app, '/file.json')
      expect(res.status).not.toBe(308)
    })

    it('does not redirect the root path', async () => {
      const res = await fetchPath(app, '/')
      expect(res.status).not.toBe(308)
    })
  })

  describe("mode 'always' with exclusions", () => {
    let app: Application

    beforeEach(async () => {
      app = createApp({ trailingSlash: { mode: 'always', exclude: ['/callback'] } })
      await app.initialize()
    })

    afterEach(async () => {
      await app.shutdown()
    })

    it('serves the excluded path without redirecting (non-trailing form)', async () => {
      const res = await fetchPath(app, '/callback')
      expect(res.status).toBe(200)
    })

    it('serves the excluded path without redirecting (trailing form)', async () => {
      const res = await fetchPath(app, '/callback/')
      expect(res.status).toBe(200)
    })

    it('still redirects non-excluded paths', async () => {
      const res = await fetchPath(app, '/users')
      expect(res.status).toBe(308)
      expect(res.headers.get('Location')).toBe('/users/')
    })
  })

  describe("mode 'never'", () => {
    let app: Application

    beforeEach(async () => {
      app = createApp({ trailingSlash: 'never' })
      await app.initialize()
    })

    afterEach(async () => {
      await app.shutdown()
    })

    it('redirects trailing requests to the non-trailing form with 308', async () => {
      const res = await fetchPath(app, '/users/')
      expect(res.status).toBe(308)
      expect(res.headers.get('Location')).toBe('/users')
      expect(handlerHits.index).toBe(0)
    })

    it('serves non-trailing requests directly', async () => {
      const res = await fetchPath(app, '/users')
      expect(res.status).toBe(200)
      expect(handlerHits.index).toBe(1)
    })

    it('preserves query strings on redirect', async () => {
      const res = await fetchPath(app, '/users/?page=2')
      expect(res.status).toBe(308)
      expect(res.headers.get('Location')).toBe('/users?page=2')
    })

    it('does not redirect the root path', async () => {
      const res = await fetchPath(app, '/')
      expect(res.status).not.toBe(308)
    })
  })

  describe('createTrailingSlashRedirect with locales (path-based i18n)', () => {
    async function invoke(mw: MiddlewareHandler, path: string) {
      let redirected: string | null = null
      let nexted = false
      const c = {
        req: { url: `http://localhost${path}` },
        redirect: (location: string, status: number) => {
          redirected = location
          return new Response(null, { status })
        },
      }
      await mw(c as never, () => {
        nexted = true
        return Promise.resolve()
      })
      return { redirected, nexted }
    }

    it('exempts locale-prefixed forms of excluded paths', async () => {
      const mw = createTrailingSlashRedirect(
        { mode: 'always', exclude: ['/callback'] },
        () => ['en', 'fr'],
      )!

      expect(await invoke(mw, '/fr/callback')).toEqual({ redirected: null, nexted: true })
      expect(await invoke(mw, '/callback')).toEqual({ redirected: null, nexted: true })
      expect((await invoke(mw, '/fr/users')).redirected).toBe('/fr/users/')
    })

    it('locale list is read lazily per request', async () => {
      let locales: string[] | undefined
      const mw = createTrailingSlashRedirect({ mode: 'always', exclude: ['/callback'] }, () => locales)!

      // Before i18n resolves its locales, the prefixed form is not exempt…
      expect((await invoke(mw, '/fr/callback')).redirected).toBe('/fr/callback/')

      // …after it resolves, it is.
      locales = ['en', 'fr']
      expect(await invoke(mw, '/fr/callback')).toEqual({ redirected: null, nexted: true })
    })
  })
})
