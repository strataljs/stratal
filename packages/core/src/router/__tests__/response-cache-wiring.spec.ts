import { afterEach, describe, expect, it, vi } from 'vitest'
import { Application } from '../../application'
import { Transient } from '../../di/decorators'
import type { StratalEnv } from '../../env'
import { UseGuards, type CanActivate } from '../../guards'
import { boolean, object, string } from 'zod/mini'
import { LogLevel } from '../../logger'
import { Module } from '../../module/module.decorator'
import { Cacheable, PurgesCache } from '../../response-cache/decorators'
import { ResponseCacheConfigError } from '../../response-cache/errors'
import { ResponseCacheModule } from '../../response-cache/response-cache.module'
import { Controller, Get, Post, Route } from '../decorators'
import type { Middleware, Next } from '../middleware.interface'
import type { RouteConfigurable, Router } from '../router'
import type { RouterContext } from '../router-context'
import type * as BootCheck from '../../response-cache/boot-check'

// Wraps (rather than replaces) the real `assertCachingAvailable`, so the
// boot-check tests below still exercise the genuine implementation while
// being able to assert *how many times* it was invoked — the difference
// between "the check is latched" and "the failure is latched".
const { assertCachingAvailableSpy } = vi.hoisted(() => ({ assertCachingAvailableSpy: vi.fn() }))

vi.mock('../../response-cache/boot-check', async (importOriginal) => {
  const actual = await importOriginal<typeof BootCheck>()
  assertCachingAvailableSpy.mockImplementation(actual.assertCachingAvailable)
  return { ...actual, assertCachingAvailable: assertCachingAvailableSpy }
})

// ── Fixtures ──────────────────────────────────────────────────────────

@Controller('/wiring')
class WiringController {
  @Route({ response: object({ ok: boolean() }) })
  index(ctx: RouterContext) {
    return ctx.json({ ok: true })
  }

  @Route({ params: object({ id: string() }), response: object({ id: string() }) })
  @Cacheable({ ttl: 300 })
  show(ctx: RouterContext) {
    return ctx.json({ id: ctx.c.req.param('id') })
  }

  @Route({ response: object({ purged: boolean() }) })
  @PurgesCache({ tags: ['items'] })
  create(ctx: RouterContext) {
    return ctx.json({ purged: true }, 201)
  }
}

// Stand-in for `@stratal/inertia`'s `InertiaService.render()`, which sets
// this same context key — exercised directly (no dependency on the
// `@stratal/inertia` package) to prove `applyCacheDecision()` actually reads
// it and passes it through to `CacheabilityService.apply()`. Kept as its own
// controller because `@Get` and `@Route` can't be mixed in one controller.
@Controller('/wiring-inertia')
class WiringInertiaController {
  @Get('/once-props', { response: object({ ok: boolean() }) })
  @Cacheable({ ttl: 300 })
  onceProps(ctx: RouterContext) {
    ctx.c.set('inertiaCacheSignals', { hasFlash: false, isPartial: false, hasOnceProps: true })
    return ctx.json({ ok: true })
  }

  @Get('/clean-signals', { response: object({ ok: boolean() }) })
  @Cacheable({ ttl: 300 })
  cleanInertiaSignals(ctx: RouterContext) {
    ctx.c.set('inertiaCacheSignals', { hasFlash: false, isPartial: false, hasOnceProps: false })
    return ctx.json({ ok: true })
  }
}

@Transient()
class BlockingMiddleware implements Middleware {
  async handle(_ctx: RouterContext, _next: Next): Promise<Response> {
    return Promise.resolve(new Response('blocked', { status: 403 }))
  }
}

@Controller('/wiring-blocked')
class BlockedController {
  @Route({ response: object({ ok: boolean() }) })
  index(ctx: RouterContext) {
    return ctx.json({ ok: true })
  }
}

@Transient()
class PrecognitionOverrideMiddleware implements Middleware {
  async handle(ctx: RouterContext, next: Next): Promise<Response | void> {
    ctx.c.set('validationSuccessResponse', new Response(null, { status: 204 }))
    return next()
  }
}

@Controller('/wiring-precog')
class PrecogController {
  @Route({ response: object({ ok: boolean() }) })
  index(ctx: RouterContext) {
    return ctx.json({ ok: true })
  }
}

@Module({
  controllers: [WiringController, WiringInertiaController, BlockedController, PrecogController],
  imports: [ResponseCacheModule.forRoot({})],
})
class WiringModule implements RouteConfigurable {
  configureRoutes(router: Router): void {
    router.group([BlockedController], (g) => g.middleware(BlockingMiddleware))
    router.group([PrecogController], (g) => g.middleware(PrecognitionOverrideMiddleware))
  }
}

const mockEnv = { ENVIRONMENT: 'test' } as StratalEnv

function createApp() {
  return new Application({
    module: WiringModule,
    logging: { level: LogLevel.ERROR },
    env: mockEnv,
    ctx: { waitUntil: vi.fn() },
  })
}

/** The third argument `hono.fetch()` gets — the real per-request Hono
 * `executionCtx`, distinct from the `ctx` the `Application` constructor
 * takes. Only this one carries `.cache`, mirroring Wrangler's `cache.enabled`
 * binding. */
function fetchCtx(cachePurge?: ReturnType<typeof vi.fn>) {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    ...(cachePurge ? { cache: { purge: cachePurge } } : {}),
  } as unknown as ExecutionContext
}

async function fetchPath(app: Application, path: string, init: RequestInit | undefined, ctx: ExecutionContext) {
  // `initialize()` registers the module (controllers, imports) — `ensureHono()`
  // alone never does. Route registration itself (where every boot-time check
  // in this file fires) happens inside `ensureHono()` → `HonoApp.configure()`.
  await app.initialize()
  const hono = await app.ensureHono()
  return hono.fetch(new Request(`http://localhost${path}`, init), mockEnv, ctx)
}

/**
 * Run both halves of boot (`initialize()` registers the module;
 * `ensureHono()` is what actually registers routes and runs every
 * `bindRouteCache`/wildcard/`forRootAsync` check in this file) and capture
 * the rejection object, so both its class and its message can be asserted
 * from one boot attempt.
 */
async function captureInitError(app: Application): Promise<unknown> {
  try {
    await app.initialize()
    await app.ensureHono()
    return undefined
  } catch (error) {
    return error
  }
}

describe('response-cache wiring (route-registration.service.ts)', () => {
  describe('request-time caching decisions', () => {
    let app: Application

    afterEach(async () => {
      await app.shutdown()
    })

    it('stamps an un-annotated route private, no-store', async () => {
      app = createApp()
      const res = await fetchPath(app, '/wiring', undefined, fetchCtx(vi.fn()))
      expect(res.status).toBe(200)
      expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    })

    it('stamps a @Cacheable route public, max-age=…', async () => {
      app = createApp()
      const res = await fetchPath(app, '/wiring/42', undefined, fetchCtx(vi.fn()))
      expect(res.status).toBe(200)
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=300')
    })

    it('an Inertia once-prop signal fails a @Cacheable route closed (private, no-store)', async () => {
      app = createApp()
      const res = await fetchPath(app, '/wiring-inertia/once-props', undefined, fetchCtx(vi.fn()))
      expect(res.status).toBe(200)
      expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    })

    it('clean Inertia cache signals (no flash/partial/once-props) still cache normally', async () => {
      // Proves the wiring actually reads the signal through, rather than
      // unconditionally rejecting whenever `inertiaCacheSignals` is present.
      app = createApp()
      const res = await fetchPath(app, '/wiring-inertia/clean-signals', undefined, fetchCtx(vi.fn()))
      expect(res.status).toBe(200)
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=300')
    })

    it('a @PurgesCache-only route purges on success — locks in the purge-gating fix', async () => {
      app = createApp()
      const purge = vi.fn().mockResolvedValue({ success: true })
      const res = await fetchPath(app, '/wiring', { method: 'POST' }, fetchCtx(purge))
      expect(res.status).toBe(201)
      expect(purge).toHaveBeenCalledWith({ tags: ['items'] })
      // Still gets an explicit decision even though it isn't itself cacheable —
      // from the outer fallback middleware, not a per-handler stamp.
      expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    })

    it('a 404 emits private, no-store', async () => {
      app = createApp()
      const res = await fetchPath(app, '/nonexistent', undefined, fetchCtx())
      expect(res.status).toBe(404)
      expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    })

    it('a middleware short-circuit emits private, no-store', async () => {
      app = createApp()
      const res = await fetchPath(app, '/wiring-blocked', undefined, fetchCtx())
      expect(res.status).toBe(403)
      expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    })

    it('the precognition override is stamped', async () => {
      app = createApp()
      const res = await fetchPath(app, '/wiring-precog', undefined, fetchCtx(vi.fn()))
      expect(res.status).toBe(204)
      expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    })

    it('a @PurgesCache route whose purge() call rejects fails loudly (500), having genuinely attempted the purge', async () => {
      app = createApp()
      // Provide a cache object that throws on purge to isolate purge-gating behavior.
      // The boot check passes (cache is present), but the purge throws CachePurgeError.
      // This verifies the purge-gating fix from Task 9: the request still fails with 500
      // after the mutation has already committed, instead of silently skipping the purge.
      const purgeThrows = vi.fn().mockRejectedValue(new Error('Purge failed'))
      const res = await fetchPath(app, '/wiring', { method: 'POST' }, fetchCtx(purgeThrows))
      expect(res.status).toBe(500)
      // The 500 itself still carries an explicit decision, via the same
      // outer fallback that catches every other error response.
      expect(res.headers.get('Cache-Control')).toBe('private, no-store')
      // Verify the purge was actually attempted (not skipped due to boot check)
      expect(purgeThrows).toHaveBeenCalledWith({ tags: ['items'] })
    })

    it('a @PurgesCache tag referencing a missing {query.*} value 500s and logs the render failure', async () => {
      // Unlike a `{body.*}` or a route-path-mismatched `{param.*}` tag (both
      // rejected at boot — see below), whether `{query.tenant}` resolves
      // depends on what *this particular request* sends, so it can only ever
      // be caught here, at request time. `buildPurgeSpec` is evaluated as an
      // argument to `purge(...)`, so without the fix this throws before
      // `purge`'s own try/catch — and its `logger.error` — are ever reached,
      // producing a 500 with nothing in the logs after the mutation already
      // committed. Assert the log itself, not just the status: that's the
      // entire point of the fix.
      @Controller('/purge-missing-tag')
      class PurgeMissingTagController {
        @Post('/item', { response: object({ purged: boolean() }) })
        @PurgesCache({ tags: ['tenant:{query.tenant}'] })
        create(ctx: RouterContext) {
          return ctx.json({ purged: true }, 201)
        }
      }
      @Module({ controllers: [PurgeMissingTagController], imports: [ResponseCacheModule.forRoot({})] })
      class PurgeMissingTagModule {}

      app = new Application({
        module: PurgeMissingTagModule,
        logging: { level: LogLevel.ERROR },
        env: mockEnv,
        ctx: { waitUntil: vi.fn() },
      })

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => { /* silence expected error log */ })

      const purge = vi.fn().mockResolvedValue({ success: true })
      const res = await fetchPath(app, '/purge-missing-tag/item', { method: 'POST' }, fetchCtx(purge))

      expect(res.status).toBe(500)
      // The tag never rendered, so `purge()` itself must never be reached —
      // proves this is caught before the cache is ever touched, not after a
      // failed purge attempt.
      expect(purge).not.toHaveBeenCalled()

      // The global `ExceptionHandler` logs every uncaught `ApplicationError`
      // too (a separate `[ApplicationError]` entry), so assert on *our*
      // specific log line rather than the total call count.
      const entries = consoleError.mock.calls.map(
        (args) => JSON.parse(args[0] as string) as Record<string, unknown>,
      )
      const logged = entries.find(
        (entry) => entry.message === '[stratal:response-cache] Failed to render @PurgesCache tags',
      )
      expect(logged).toBeDefined()
      expect(logged?.level).toBe('error')
      expect(logged?.controller).toBe('PurgeMissingTagController')
      expect(logged?.action).toBe('create')
      expect(logged?.path).toBe('/purge-missing-tag/item')
      expect(logged?.error).toMatch(/query\.tenant/)

      consoleError.mockRestore()
    })

    it('the `cache` binding vanishing mid-lifetime still fails the purge loudly via the defensive guard', async () => {
      // `assertCachingAvailable` latches on the *first* request this
      // `RouteRegistrationService` instance ever handles, using whichever
      // executionCtx that request happens to carry — and in a real Workers
      // deploy `cache.enabled` is a static setting, so `ctx.cache`'s presence
      // can never actually change between requests within one isolate. This
      // test manufactures the scenario the boot check cannot itself prevent:
      // an app whose *first* request (to an unrelated route) has `cache`
      // present — so the boot check passes and is never repeated — followed
      // by a later request to a @PurgesCache route whose executionCtx has no
      // `cache` at all. That proves `applyCacheDecision`'s own `!cache` guard
      // is reachable independently of the boot check, not dead code.
      app = createApp()

      const firstReqCache = fetchCtx(vi.fn().mockResolvedValue({ success: true }))
      const first = await fetchPath(app, '/wiring/42', undefined, firstReqCache)
      expect(first.status).toBe(200)

      const secondReqNoCache = fetchCtx() // no `cache` at all on this request's executionCtx
      const second = await fetchPath(app, '/wiring', { method: 'POST' }, secondReqNoCache)

      expect(second.status).toBe(500)
      expect(second.headers.get('Cache-Control')).toBe('private, no-store')
    })
  })

  describe('boot-time guarantees', () => {
    it('throws when a route uses @Cacheable but ResponseCacheModule was never imported', async () => {
      @Controller('/opt-in-missing')
      class OptInMissingController {
        @Route({ response: object({ ok: boolean() }) })
        @Cacheable({ ttl: 60 })
        index(ctx: RouterContext) {
          return ctx.json({ ok: true })
        }
      }
      @Module({ controllers: [OptInMissingController] })
      class OptInMissingModule {}

      const app = new Application({
        module: OptInMissingModule,
        logging: { level: LogLevel.ERROR },
        env: mockEnv,
        ctx: { waitUntil: vi.fn() },
      })

      const caught = await captureInitError(app)

      expect(caught).toBeInstanceOf(ResponseCacheConfigError)
      // The route doesn't just fail to register — without this guard it
      // would register and run fine, silently never caching. The message
      // has to say that, or an author has no way to know why.
      expect((caught as Error).message).toMatch(/silently dropped/i)
      expect((caught as Error).message).toMatch(/ResponseCacheModule/)
    })

    it('throws when a wildcard handle() carries @PurgesCache', async () => {
      @Controller('/wildcard-cache')
      class WildcardCacheController {
        @PurgesCache({ tags: ['x'] })
        async handle(ctx: RouterContext) {
          return Promise.resolve(ctx.json({ ok: true }))
        }
      }
      @Module({ controllers: [WildcardCacheController], imports: [ResponseCacheModule.forRoot({})] })
      class WildcardCacheModule {}

      const app = new Application({
        module: WildcardCacheModule,
        logging: { level: LogLevel.ERROR },
        env: mockEnv,
        ctx: { waitUntil: vi.fn() },
      })

      const caught = await captureInitError(app)

      expect(caught).toBeInstanceOf(ResponseCacheConfigError)
      expect((caught as Error).message).toMatch(/wildcard/i)
    })

    it('throws when forRootAsync resolves defaults to a Promise instead of the awaited options', async () => {
      @Controller('/async-defaults')
      class AsyncDefaultsController {
        @Route({ response: object({ ok: boolean() }) })
        index(ctx: RouterContext) {
          return ctx.json({ ok: true })
        }
      }
      @Module({
        controllers: [AsyncDefaultsController],
        imports: [
          ResponseCacheModule.forRootAsync({
            useFactory: () => Promise.resolve({ defaults: { ttl: 60, partitionBy: ['user'] } }),
          }),
        ],
      })
      class AsyncDefaultsModule {}

      const app = new Application({
        module: AsyncDefaultsModule,
        logging: { level: LogLevel.ERROR },
        env: mockEnv,
        ctx: { waitUntil: vi.fn() },
      })

      const caught = await captureInitError(app)

      expect(caught).toBeInstanceOf(ResponseCacheConfigError)
      expect((caught as Error).message).toMatch(/forRootAsync/)
      expect((caught as Error).message).toMatch(/Promise/)
    })

    it('throws when @Cacheable routes exist but ctx.cache is absent', async () => {
      @Controller('/cacheable-missing')
      class CacheableController {
        @Get('/cacheable', { response: object({ ok: boolean() }) })
        @Cacheable({ ttl: 60 })
        cacheable(ctx: RouterContext) {
          return ctx.json({ ok: true })
        }

        @Get('/normal', { response: object({ ok: boolean() }) })
        normal(ctx: RouterContext) {
          return ctx.json({ ok: true })
        }
      }
      @Module({ controllers: [CacheableController], imports: [ResponseCacheModule.forRoot({})] })
      class CacheableModule {}

      const app = new Application({
        module: CacheableModule,
        logging: { level: LogLevel.ERROR },
        env: mockEnv,
        ctx: { waitUntil: vi.fn() },
      })

      await app.initialize()
      const hono = await app.ensureHono()

      // First request (to non-cacheable route) should trigger the boot check
      // and throw because cache is not available. When thrown in a handler,
      // Hono converts it to a 500 response.
      const response = await hono.fetch(
        new Request('http://localhost/cacheable-missing/normal'),
        mockEnv,
        { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext,
      )

      // The boot check throws ResponseCacheConfigError, which Hono converts to 500
      expect(response.status).toBe(500)
    })

    it('does not throw when @Cacheable routes exist and ctx.cache is present', async () => {
      @Controller('/cacheable-present')
      class CacheableController {
        @Get('/cacheable', { response: object({ ok: boolean() }) })
        @Cacheable({ ttl: 60 })
        cacheable(ctx: RouterContext) {
          return ctx.json({ ok: true })
        }
      }
      @Module({ controllers: [CacheableController], imports: [ResponseCacheModule.forRoot({})] })
      class CacheableModule {}

      const app = new Application({
        module: CacheableModule,
        logging: { level: LogLevel.ERROR },
        env: mockEnv,
        ctx: { waitUntil: vi.fn() },
      })

      await app.initialize()
      const hono = await app.ensureHono()

      // Request with cache binding should succeed
      const response = await hono.fetch(
        new Request('http://localhost/cacheable-present/cacheable'),
        mockEnv,
        { waitUntil: vi.fn(), passThroughOnException: vi.fn(), cache: { purge: vi.fn() } } as unknown as ExecutionContext,
      )

      expect(response.status).toBe(200)
    })

    it('does not throw when zero cacheable routes exist (even without cache)', async () => {
      @Controller('/no-cacheable')
      class NoCacheableController {
        @Route({ response: object({ ok: boolean() }) })
        index(ctx: RouterContext) {
          return ctx.json({ ok: true })
        }
      }
      @Module({ controllers: [NoCacheableController], imports: [ResponseCacheModule.forRoot({})] })
      class NoCacheableModule {}

      const app = new Application({
        module: NoCacheableModule,
        logging: { level: LogLevel.ERROR },
        env: mockEnv,
        ctx: { waitUntil: vi.fn() },
      })

      await app.initialize()
      const hono = await app.ensureHono()

      // Request without cache should succeed because there are no cacheable routes
      const response = await hono.fetch(
        new Request('http://localhost/no-cacheable'),
        mockEnv,
        { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext,
      )

      expect(response.status).toBe(200)
    })

    it('@PurgesCache-only routes trigger the boot check when cache is absent', async () => {
      @Controller('/purge-only')
      class PurgeOnlyController {
        @Get('/item', { response: object({ ok: boolean() }) })
        getItem(ctx: RouterContext) {
          return ctx.json({ ok: true })
        }

        @Post('/item', { response: object({ created: boolean() }) })
        @PurgesCache({ tags: ['items'] })
        createItem(ctx: RouterContext) {
          return ctx.json({ created: true }, 201)
        }
      }
      @Module({ controllers: [PurgeOnlyController], imports: [ResponseCacheModule.forRoot({})] })
      class PurgeOnlyModule {}

      const app = new Application({
        module: PurgeOnlyModule,
        logging: { level: LogLevel.ERROR },
        env: mockEnv,
        ctx: { waitUntil: vi.fn() },
      })

      await app.initialize()
      const hono = await app.ensureHono()

      // Request to a non-purge route that triggers boot check.
      // Since the app has @PurgesCache routes but no cache, the check should fire.
      const response = await hono.fetch(
        new Request('http://localhost/purge-only/item'),
        mockEnv,
        { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext,
      )

      expect(response.status).toBe(500)
    })

    it('throws when a @PurgesCache tag uses the {body.*} scope, reached via real route registration', async () => {
      @Controller('/body-scope-purge')
      class BodyScopePurgeController {
        @Route({ response: object({ purged: boolean() }) })
        @PurgesCache({ tags: ['item:{body.id}'] })
        create(ctx: RouterContext) {
          return ctx.json({ purged: true }, 201)
        }
      }
      @Module({ controllers: [BodyScopePurgeController], imports: [ResponseCacheModule.forRoot({})] })
      class BodyScopePurgeModule {}

      const app = new Application({
        module: BodyScopePurgeModule,
        logging: { level: LogLevel.ERROR },
        env: mockEnv,
        ctx: { waitUntil: vi.fn() },
      })

      const caught = await captureInitError(app)

      // Proves `bindRouteCache`'s `{body.*}` rejection is actually reached
      // during real route registration, not just callable in isolation — a
      // unit test on `bindRouteCache` alone wouldn't catch a wiring mistake
      // (e.g. the check never being invoked from `collectRoutes`).
      expect(caught).toBeInstanceOf(ResponseCacheConfigError)
      expect((caught as Error).message).toMatch(/item:\{body\.id\}/)
      expect((caught as Error).message).toMatch(/not available/i)
    })

    it('throws when a @Cacheable tag uses the {body.*} scope, reached via real route registration', async () => {
      @Controller('/body-scope-cacheable')
      class BodyScopeCacheableController {
        @Route({ response: object({ id: string() }) })
        @Cacheable({ ttl: 60, tags: ['item:{body.id}'] })
        show(ctx: RouterContext) {
          return ctx.json({ id: '1' })
        }
      }
      @Module({ controllers: [BodyScopeCacheableController], imports: [ResponseCacheModule.forRoot({})] })
      class BodyScopeCacheableModule {}

      const app = new Application({
        module: BodyScopeCacheableModule,
        logging: { level: LogLevel.ERROR },
        env: mockEnv,
        ctx: { waitUntil: vi.fn() },
      })

      const caught = await captureInitError(app)

      expect(caught).toBeInstanceOf(ResponseCacheConfigError)
      expect((caught as Error).message).toMatch(/item:\{body\.id\}/)
      expect((caught as Error).message).toMatch(/not available/i)
    })

    it('performs the boot check once but keeps failing every later request', async () => {
      @Controller('/once-check')
      class OnceCheckController {
        @Get('/cacheable', { response: object({ ok: boolean() }) })
        @Cacheable({ ttl: 60 })
        cacheable(ctx: RouterContext) {
          return ctx.json({ ok: true })
        }
      }
      @Module({ controllers: [OnceCheckController], imports: [ResponseCacheModule.forRoot({})] })
      class OnceCheckModule {}

      const app = new Application({
        module: OnceCheckModule,
        logging: { level: LogLevel.ERROR },
        env: mockEnv,
        ctx: { waitUntil: vi.fn() },
      })

      await app.initialize()
      const hono = await app.ensureHono()

      // Other tests in this file boot their own apps and trip the same check.
      assertCachingAvailableSpy.mockClear()

      const request = () =>
        hono.fetch(
          new Request('http://localhost/once-check/cacheable'),
          mockEnv,
          { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext,
        )

      // The *work* happens once — `bootCheckPerformed` latches, so
      // `assertCachingAvailable` is not re-run per request.
      const first = await request()
      expect(first.status).toBe(500)
      expect(assertCachingAvailableSpy).toHaveBeenCalledTimes(1)

      // …but the *result* is latched too, and rethrown. Latching only the
      // attempt would let request #2 onwards succeed while stamping
      // `public, max-age=60` on a response nothing can ever cache — the exact
      // silent no-op the boot check exists to prevent.
      const second = await request()
      expect(second.status).toBe(500)
      expect(assertCachingAvailableSpy).toHaveBeenCalledTimes(1)

      // Third, to show it is a standing failure rather than an alternation.
      const third = await request()
      expect(third.status).toBe(500)
      expect(third.headers.get('Cache-Control')).toBe('private, no-store')
      expect(assertCachingAvailableSpy).toHaveBeenCalledTimes(1)
    })

    it('throws when @Cacheable is applied to a route carrying a real @UseGuards', async () => {
      @Transient()
      class DenyGuard implements CanActivate {
        canActivate(): boolean {
          return false
        }
      }

      @Controller('/guarded-cacheable')
      @UseGuards(DenyGuard)
      class GuardedCacheableController {
        @Route({ response: object({ ok: boolean() }) })
        @Cacheable({ ttl: 60 })
        index(ctx: RouterContext) {
          return ctx.json({ ok: true })
        }
      }
      @Module({ controllers: [GuardedCacheableController], imports: [ResponseCacheModule.forRoot({})] })
      class GuardedCacheableModule {}

      const app = new Application({
        module: GuardedCacheableModule,
        logging: { level: LogLevel.ERROR },
        env: mockEnv,
        ctx: { waitUntil: vi.fn() },
      })

      const caught = await captureInitError(app)

      // `resolve-cacheable.spec.ts` only ever hands `{ guarded: true }` in by
      // hand. This is the end-to-end proof that `collectRoutes`'s guard
      // collection actually reaches `resolveCacheable` — without it, a
      // refactor of guard collection could make every guarded route publicly
      // cacheable with every existing test still green.
      expect(caught).toBeInstanceOf(ResponseCacheConfigError)
      expect((caught as Error).message).toMatch(/GuardedCacheableController\.index/)
      expect((caught as Error).message).toMatch(/guarded route/i)
    })

    it('throws when @Cacheable is applied to a method carrying a method-level @UseGuards', async () => {
      @Transient()
      class DenyMethodGuard implements CanActivate {
        canActivate(): boolean {
          return false
        }
      }

      @Controller('/guarded-method-cacheable')
      class GuardedMethodController {
        @Route({ response: object({ ok: boolean() }) })
        @UseGuards(DenyMethodGuard)
        @Cacheable({ ttl: 60 })
        index(ctx: RouterContext) {
          return ctx.json({ ok: true })
        }
      }
      @Module({ controllers: [GuardedMethodController], imports: [ResponseCacheModule.forRoot({})] })
      class GuardedMethodModule {}

      const app = new Application({
        module: GuardedMethodModule,
        logging: { level: LogLevel.ERROR },
        env: mockEnv,
        ctx: { waitUntil: vi.fn() },
      })

      const caught = await captureInitError(app)

      expect(caught).toBeInstanceOf(ResponseCacheConfigError)
      expect((caught as Error).message).toMatch(/guarded route/i)
    })

    it('throws when a @PurgesCache {param.X} tag has no matching :X in the route\'s own path', async () => {
      @Controller('/param-scope-purge')
      class ParamScopePurgeController {
        // No `:id` (or any other) path param on this route at all — `{param.id}`
        // can never resolve, and unlike `{query.*}`/`{data.*}` that is knowable
        // right now, from the route's own path, without waiting for a request.
        @Route({ response: object({ purged: boolean() }) })
        @PurgesCache({ tags: ['item:{param.id}'] })
        create(ctx: RouterContext) {
          return ctx.json({ purged: true }, 201)
        }
      }
      @Module({ controllers: [ParamScopePurgeController], imports: [ResponseCacheModule.forRoot({})] })
      class ParamScopePurgeModule {}

      const app = new Application({
        module: ParamScopePurgeModule,
        logging: { level: LogLevel.ERROR },
        env: mockEnv,
        ctx: { waitUntil: vi.fn() },
      })

      const caught = await captureInitError(app)

      // Reached via real route registration (not just `bindRouteCache` called
      // directly), proving `collectRoutes` actually supplies the route's path
      // params through to the check.
      expect(caught).toBeInstanceOf(ResponseCacheConfigError)
      expect((caught as Error).message).toMatch(/item:\{param\.id\}/)
      expect((caught as Error).message).toMatch(/no ":id" segment/)
      expect((caught as Error).message).toMatch(/\(none\)/)
    })

    it('throws when a @Cacheable {param.X} tag has no matching :X in the route\'s own path', async () => {
      @Controller('/param-scope-cacheable')
      class ParamScopeCacheableController {
        // Convention routing derives `show()`'s path param literally as
        // `:id` (see `@Route`'s doc) regardless of the zod schema's key name
        // — so `{param.slug}` references a segment this route's path will
        // never have.
        @Route({ params: object({ id: string() }), response: object({ id: string() }) })
        @Cacheable({ ttl: 60, tags: ['item:{param.slug}'] })
        show(ctx: RouterContext) {
          return ctx.json({ id: ctx.c.req.param('id') })
        }
      }
      @Module({ controllers: [ParamScopeCacheableController], imports: [ResponseCacheModule.forRoot({})] })
      class ParamScopeCacheableModule {}

      const app = new Application({
        module: ParamScopeCacheableModule,
        logging: { level: LogLevel.ERROR },
        env: mockEnv,
        ctx: { waitUntil: vi.fn() },
      })

      const caught = await captureInitError(app)

      expect(caught).toBeInstanceOf(ResponseCacheConfigError)
      expect((caught as Error).message).toMatch(/item:\{param\.slug\}/)
      expect((caught as Error).message).toMatch(/no ":slug" segment/)
      // Names what *is* available, so the author isn't left guessing.
      expect((caught as Error).message).toMatch(/available params: id/)
    })

    it('allows a @PurgesCache {param.X} tag whose X matches the route\'s own path param', async () => {
      @Controller('/param-scope-ok')
      class ParamScopeOkController {
        @Route({ params: object({ id: string() }), response: object({ purged: boolean() }) })
        @PurgesCache({ tags: ['item:{param.id}'] })
        destroy(ctx: RouterContext) {
          return ctx.json({ purged: true })
        }
      }
      @Module({ controllers: [ParamScopeOkController], imports: [ResponseCacheModule.forRoot({})] })
      class ParamScopeOkModule {}

      const app = new Application({
        module: ParamScopeOkModule,
        logging: { level: LogLevel.ERROR },
        env: mockEnv,
        ctx: { waitUntil: vi.fn() },
      })

      // Registration must succeed — `:id` is a real param on this route's path.
      await expect(captureInitError(app)).resolves.toBeUndefined()
      await app.shutdown()
    })

    it('throws when a @PurgesCache pathPrefixes entry contains a `{…}` placeholder', async () => {
      @Controller('/templated-prefix')
      class TemplatedPrefixController {
        @Route({ response: object({ purged: boolean() }) })
        @PurgesCache({ pathPrefixes: ['/blog/{param.slug}'] })
        create(ctx: RouterContext) {
          return ctx.json({ purged: true }, 201)
        }
      }
      @Module({ controllers: [TemplatedPrefixController], imports: [ResponseCacheModule.forRoot({})] })
      class TemplatedPrefixModule {}

      const app = new Application({
        module: TemplatedPrefixModule,
        logging: { level: LogLevel.ERROR },
        env: mockEnv,
        ctx: { waitUntil: vi.fn() },
      })

      const caught = await captureInitError(app)

      // `buildPurgeSpec` copies `pathPrefixes` through verbatim, so this
      // would be purged as a literal string and match nothing at all.
      expect(caught).toBeInstanceOf(ResponseCacheConfigError)
      expect((caught as Error).message).toMatch(/\/blog\/\{param\.slug\}/)
      expect((caught as Error).message).toMatch(/not interpolated/i)
    })
  })
})
