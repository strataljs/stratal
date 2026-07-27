import { Test, type TestingModule } from '@stratal/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
    NoCacheAppModule,
    ResponseCacheAppModule,
} from '../fixtures/response-cache.controller'

/**
 * Workerd integration coverage for `stratal/response-cache`.
 *
 * `@stratal/testing` installs a `ctx.cache` stub by default (`TestWorkersCache`,
 * see `packages/testing/src/mocks/test-workers-cache.ts`) precisely because
 * neither Miniflare nor workerd ever populates `ExecutionContext.cache` on its
 * own — probing established that even with `cache.enabled: true` and `compatibility_date:
 * 2026-07-10` set experimentally on `test/wrangler.jsonc`, `typeof
 * ctx.executionCtx.cache` came back `'undefined'`, both via a real `SELF`
 * worker dispatch and via `Test.createTestingModule()`. Without the stub,
 * every consumer who adopts `@Cacheable`/`@PurgesCache` would see their whole
 * test suite 500 on the very first request, with no documented remedy — that
 * usability defect is what the stub fixes.
 *
 * This file exercises both runtimes the stub makes possible:
 *
 * 1. **The stub present (default, no config)** — proves the headline claim:
 *    a `@Cacheable` route returns real caching headers, and a `@PurgesCache`
 *    route's purge succeeds and is recorded on `module.cache.purges`, with
 *    zero setup. Real header-emission/purge behavior is also covered against
 *    a *mocked* cache in the node project
 *    (`src/router/__tests__/response-cache-wiring.spec.ts`, 19 tests) — this
 *    file additionally proves it in the real workerd runtime, which is
 *    genuinely new information (previously untestable there at all).
 * 2. **The stub opted out (`cache: false`)** — reproduces the genuinely
 *    unconfigured runtime this feature's boot guard exists for, so that guard
 *    stays testable. `assertCachingAvailable` fires on the first request to
 *    an app with cache-decorated routes — even a request to a route with no
 *    cache decorator of its own — and 500s. The check is a latch on its
 *    *result*, not merely the attempt: every later request in the same app
 *    keeps failing too, so a misconfigured deploy can never silently start
 *    serving uncached traffic after one stray error.
 *
 * **Deliberately not written:** a test driving `@PurgesCache`'s per-request
 * `CachePurgeError` (thrown when the purge itself fails) through a real HTTP
 * dispatch. `TestWorkersCache.purge()` always succeeds — deliberately kept
 * minimal, see its docblock — so there is no supported way to make a purge
 * fail through `Test.createTestingModule()`; `cache: false` instead fails
 * the earlier, unrelated boot check (`ResponseCacheConfigError`), never
 * reaching the purge call at all. `CachePurgeError`'s own throw/rethrow
 * behavior is exhaustively covered against a mocked `WorkersCache` in
 * `response-cache.service.spec.ts` and `route-registration.service`'s wiring
 * tests — this file does not duplicate that.
 */
describe('response-cache: workerd integration', () => {
  describe('no cache decorators anywhere in the app', () => {
    let module: TestingModule

    beforeAll(async () => {
      module = await Test.createTestingModule({ imports: [NoCacheAppModule] }).compile()
    })

    afterAll(async () => {
      await module.close()
    })

    it('stamps Cache-Control: private, no-store on a plain route (boot check never engages)', async () => {
      const response = await module.http.get('/cache-demo-clean/plain').send()

      response.assertOk()
      response.assertHeader('Cache-Control', 'private, no-store')
    })
  })

  describe('an app with @Cacheable/@PurgesCache routes, using the default ctx.cache stub', () => {
    let module: TestingModule

    beforeAll(async () => {
      module = await Test.createTestingModule({ imports: [ResponseCacheAppModule] }).compile()
    })

    afterAll(async () => {
      await module.close()
    })

    it('returns 200 with a real Cache-Control header for a @Cacheable route, with zero cache configuration', async () => {
      const response = await module.http.get('/cache-demo/cacheable').send()

      response.assertOk()
      response.assertHeader('Cache-Control', 'public, max-age=60')
    })

    it('also emits the declared Cache-Tag for that route', async () => {
      const response = await module.http.get('/cache-demo/cacheable').send()

      response.assertHeader('Cache-Tag', 'demo')
    })

    it('succeeds a @PurgesCache route and records the purge spec on module.cache.purges', async () => {
      const response = await module.http.post('/cache-demo/purge').send()

      response.assertOk()
      expect(module.cache.purges).toEqual([{ tags: ['demo'] }])
    })
  })

  describe('an app with @Cacheable/@PurgesCache routes, opted out of the stub (`cache: false`)', () => {
    let module: TestingModule

    beforeAll(async () => {
      module = await Test.createTestingModule({ imports: [ResponseCacheAppModule], cache: false }).compile()
    })

    afterAll(async () => {
      await module.close()
    })

    it('500s the very first request in the app — even to a route with no cache decorator of its own', async () => {
      // This is the app's first-ever request, and it hits /plain, which has
      // neither @Cacheable nor @PurgesCache. It still 500s: the boot check
      // counts cache-decorated routes across the WHOLE app and fires on the
      // first request to ANY of them, exactly as `route-registration.service.ts`
      // documents. This is real, unmocked Miniflare behavior — there is no
      // mock anywhere in this file.
      const response = await module.http.get('/cache-demo/plain').send()

      response.assertServerError()
    })

    it('keeps failing on every later request, so a misconfigured deploy can never silently serve uncached', async () => {
      // Same app, same module instance, second request overall — and it must
      // fail too. The latch remembers the boot check's *result*, not merely
      // that it was attempted, so the error is rethrown rather than skipped.
      //
      // Latching the attempt would be far worse than not checking at all:
      // exactly one arbitrary request per isolate would 500, and every request
      // after it would return `Cache-Control: public, max-age=…` while nothing
      // was ever stored — the precise silent no-op this guard exists to
      // prevent, made harder to spot by the single stray error.
      const response = await module.http.get('/cache-demo/cacheable').send()

      response.assertServerError()
    })

    it('still stamps an explicit caching decision on the failure response', async () => {
      // Even the boot-check 500 carries a decision. Workers Caching applies
      // RFC 9111 heuristic freshness, so a header-less 500 would be eligible
      // for caching on status codes that allow it — the global fallback
      // middleware runs outside the handler and covers this path too.
      const response = await module.http.get('/cache-demo/cacheable').send()

      response.assertHeader('Cache-Control', 'private, no-store')
    })
  })
})
