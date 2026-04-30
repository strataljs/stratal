import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Application, type ApplicationOptions } from '../../application'
import type { StratalEnv } from '../../env'
import { z } from '../../i18n/validation'
import { LogLevel } from '../../logger'
import { Module } from '../../module/module.decorator'
import { Controller } from '../decorators/controller.decorator'
import { Route } from '../decorators/route.decorator'
import type { RouterContext } from '../router-context'

const handlerHits = { index: 0, create: 0 }

@Controller('/users')
class UsersController {
  @Route({ response: z.object({ ok: z.boolean() }) })
  index(ctx: RouterContext) {
    handlerHits.index += 1
    return ctx.json({ ok: true })
  }

  @Route({
    body: z.object({ name: z.string() }),
    response: z.object({ created: z.boolean() }),
  })
  create(ctx: RouterContext) {
    handlerHits.create += 1
    return ctx.json({ created: true }, 201)
  }
}

@Module({ controllers: [UsersController] })
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
      expect(res.headers.get('Location')).toBe('http://localhost/users/')
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
      expect(res.headers.get('Location')).toBe('http://localhost/users/?page=2&sort=name')
    })

    it('uses 308 so POST bodies survive the redirect', async () => {
      const res = await fetchPath(app, '/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'jane' }),
      })
      expect(res.status).toBe(308)
      expect(res.headers.get('Location')).toBe('http://localhost/users/')
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
      expect(res.headers.get('Location')).toBe('http://localhost/users')
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
      expect(res.headers.get('Location')).toBe('http://localhost/users?page=2')
    })

    it('does not redirect the root path', async () => {
      const res = await fetchPath(app, '/')
      expect(res.status).not.toBe(308)
    })
  })
})
