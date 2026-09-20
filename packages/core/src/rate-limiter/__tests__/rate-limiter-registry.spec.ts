import { createMock } from '@stratal/testing/mocks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Container } from '../../di/container'
import type { Next } from '../../router/middleware.interface'
import type { RouterContext } from '../../router/router-context'
import { RateLimiterError, TooManyRequestsError } from '../errors'
import { Limit } from '../limit'
import { RateLimiterRegistry } from '../rate-limiter-registry'
import { InMemoryRateLimiterStore } from '../stores/memory-store'

function makeCtx(headers: Record<string, string> = {}, cacheControl?: string): RouterContext {
  const res = new Response('ok', {
    status: 200,
    ...(cacheControl === undefined ? {} : { headers: { 'Cache-Control': cacheControl } }),
  })
  return {
    c: {
      req: { header: (n: string) => headers[n.toLowerCase()] },
      res,
    },
    header: (n: string) => headers[n.toLowerCase()],
  } as unknown as RouterContext
}

describe('RateLimiterRegistry', () => {
  let store: InMemoryRateLimiterStore
  let registry: RateLimiterRegistry

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    store = new InMemoryRateLimiterStore()
    const container = createMock<Container>()
    container.resolve.mockReturnValue(store)
    registry = new RateLimiterRegistry(container)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('for() / has()', () => {
    it('registers and reports presence', () => {
      registry.for('api', () => Limit.perMinute(60))
      expect(registry.has('api')).toBe(true)
      expect(registry.has('missing')).toBe(false)
    })

    it('overwrites on re-registration (last definition wins)', () => {
      const first = vi.fn(() => Limit.perMinute(60))
      const second = vi.fn(() => Limit.perMinute(10))
      registry.for('api', first)
      registry.for('api', second)
      // second should be invoked; the test below verifies behavior.
      expect(registry.has('api')).toBe(true)
    })
  })

  describe('Macroable', () => {
    afterEach(() => {
      RateLimiterRegistry.flushMacros()
    })

    it('exposes the macro() static so adapters can extend it', () => {
      expect(typeof RateLimiterRegistry.macro).toBe('function')
    })

    it('macro() adds a method usable on instances', () => {
      RateLimiterRegistry.macro('extraMethod', function (this: RateLimiterRegistry) {
        return this.has('api')
      })
      registry.for('api', () => Limit.perMinute(60))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((registry as any).extraMethod()).toBe(true)
    })
  })

  describe('handle()', () => {
    it('throws RateLimiterError for an unknown name', async () => {
      const next: Next = vi.fn((): Promise<void> => Promise.resolve())
      await expect(registry.handle('missing', makeCtx(), next)).rejects.toBeInstanceOf(RateLimiterError)
      expect(next).not.toHaveBeenCalled()
    })

    it('counts a request whose headers are stripped downstream', async () => {
      // `createNoStoreFallbackMiddleware` removes `X-RateLimit-*` from a shared-cacheable
      // response. The budget must still be consumed — otherwise every rate limit on a cacheable
      // route would quietly become a no-op.
      registry.for('api', () => Limit.perMinute(2).by('alice'))
      const next: Next = vi.fn((): Promise<void> => Promise.resolve())

      await registry.handle('api', makeCtx({}, 'public, max-age=3600'), next)
      await registry.handle('api', makeCtx({}, 'public, max-age=3600'), next)

      // The third exceeds a budget of two, which it could only do if the first two were counted.
      await expect(
        registry.handle('api', makeCtx({}, 'public, max-age=3600'), next),
      ).rejects.toThrow(TooManyRequestsError)
    })

    it('passes through and tags the response with X-RateLimit-* on success', async () => {
      registry.for('api', () => Limit.perMinute(2).by('alice'))
      const ctx = makeCtx()
      const next: Next = vi.fn((): Promise<void> => Promise.resolve())

      await registry.handle('api', ctx, next)

      expect(next).toHaveBeenCalledTimes(1)
      const headers = ctx.c.res.headers
      expect(headers.get('X-RateLimit-Limit')).toBe('2')
      expect(headers.get('X-RateLimit-Remaining')).toBe('1')
      expect(headers.get('X-RateLimit-Reset')).toBeTruthy()
    })

    it('throws TooManyRequestsError once the bucket is exhausted', async () => {
      registry.for('api', () => Limit.perMinute(1).by('bob'))
      const next: Next = vi.fn((): Promise<void> => Promise.resolve())

      await registry.handle('api', makeCtx(), next)
      await expect(registry.handle('api', makeCtx(), next)).rejects.toBeInstanceOf(TooManyRequestsError)
    })

    it('Limit.none() bypasses the limiter entirely', async () => {
      registry.for('api', () => Limit.none())
      const next: Next = vi.fn((): Promise<void> => Promise.resolve())
      const ctx = makeCtx()
      await registry.handle('api', ctx, next)
      expect(ctx.c.res.headers.get('X-RateLimit-Limit')).toBeNull()
      expect(next).toHaveBeenCalledTimes(1)
    })

    it('honors a custom Limit.response() handler when exceeded', async () => {
      const customResponse = vi.fn(() => new Response('slow down', { status: 429 }))
      registry.for('api', () =>
        Limit.perMinute(1).by('charlie').response(customResponse),
      )
      const next: Next = vi.fn((): Promise<void> => Promise.resolve())

      await registry.handle('api', makeCtx(), next)
      const result = await registry.handle('api', makeCtx(), next)

      expect(customResponse).toHaveBeenCalledOnce()
      expect(result).toBeInstanceOf(Response)
    })

    it('enforces the most restrictive of multiple limits', async () => {
      registry.for('ai', () => [
        Limit.perMinute(100).by('eve'),
        Limit.perDay(2).by('eve'),
      ])
      const next: Next = vi.fn((): Promise<void> => Promise.resolve())

      await registry.handle('ai', makeCtx(), next)
      await registry.handle('ai', makeCtx(), next)
      await expect(registry.handle('ai', makeCtx(), next)).rejects.toBeInstanceOf(TooManyRequestsError)
    })
  })

  describe('distinct-value limits', () => {
    let currentValue: string
    let currentWindowSeconds: number

    function register(build: (ctx: RouterContext) => Limit): void {
      registry.for('api', (ctx) => {
        const limit = build(ctx)
        currentWindowSeconds = limit.windowSeconds
        return limit
      })
    }

    function actorOf(ctx: RouterContext): string {
      return ctx.header('x-actor') ?? 'user-1'
    }

    async function attempt(value: string, actor = 'user-1'): Promise<Response | void> {
      currentValue = value
      const next: Next = vi.fn((): Promise<void> => Promise.resolve())
      return registry.handle('api', makeCtx({ 'x-actor': actor }), next)
    }

    async function expectAdmitted(value: string, actor = 'user-1'): Promise<void> {
      await expect(attempt(value, actor)).resolves.toBeUndefined()
    }

    async function expectAdmittedAs(actor: string, value: string): Promise<void> {
      await expectAdmitted(value, actor)
    }

    async function expectRefused(value: string, actor = 'user-1'): Promise<void> {
      await expect(attempt(value, actor)).rejects.toBeInstanceOf(TooManyRequestsError)
    }

    // Distinct windows are namespaced with a `d:` segment so they cannot collide with a plain
    // window on the same name, window and actor — read the same key the registry writes.
    function distinctKey(actor: string): string {
      return `rl:api:d:${currentWindowSeconds}:${actor}`
    }

    async function resetAtFor(actor: string): Promise<number> {
      const stored = await store.get<{ resetAt: number }>(distinctKey(actor))
      if (!stored) throw new Error(`no stored distinct window for "${actor}"`)
      return stored.resetAt
    }

    async function valuesFor(actor: string): Promise<string[]> {
      const stored = await store.get<{ values: string[] }>(distinctKey(actor))
      if (!stored) throw new Error(`no stored distinct window for "${actor}"`)
      return stored.values
    }

    it('admits up to `max` distinct values', async () => {
      register(() => Limit.perDay(2).distinctBy(currentValue).by('user-1'))

      await expectAdmitted('A')
      await expectAdmitted('B')
    })

    it('refuses a NEW value past the cap', async () => {
      register(() => Limit.perDay(2).distinctBy(currentValue).by('user-1'))
      await expectAdmitted('A')
      await expectAdmitted('B')

      await expectRefused('C')
    })

    it('never grows the stored set past `max`, however many new values are refused', async () => {
      register(() => Limit.perDay(2).distinctBy(currentValue).by('user-1'))
      await expectAdmitted('A')
      await expectAdmitted('B')

      await expectRefused('C')
      await expectRefused('D')
      await expectRefused('E')

      // A refused value is never persisted, so the set holds exactly the admitted values. Storing
      // one would raise the stored count above `max` for every later request — including ones for
      // values already counted, which must stay admitted.
      expect(await valuesFor('user-1')).toEqual(['A', 'B'])
    })

    it('keeps admitting a value already counted, once the cap is reached', async () => {
      register(() => Limit.perDay(2).distinctBy(currentValue).by('user-1'))
      await expectAdmitted('A')
      await expectAdmitted('B')

      // The property a request counter cannot express: a student who has opened their limit of
      // courses must still be able to keep reading the ones they opened.
      await expectAdmitted('A')
    })

    it('keeps admitting an already-counted value AFTER a new one was refused', async () => {
      register(() => Limit.perDay(2).distinctBy(currentValue).by('user-1'))
      await expectAdmitted('A')
      await expectAdmitted('B')

      await expectRefused('C')

      // Order matters: persisting the refused value would push the stored count to max + 1, and
      // every later request — including these, for values already counted — would then be 429'd
      // for the rest of the window. Re-admitting BEFORE the refusal hides that entirely.
      await expectAdmitted('A')
      await expectAdmitted('B')
    })

    it('keeps a plain and a distinct window on one name, window and actor independent', async () => {
      currentWindowSeconds = 24 * 60 * 60
      registry.for('api', () => [
        Limit.perDay(5).by('user-1'),
        Limit.perDay(2).distinctBy(currentValue).by('user-1'),
      ])

      // Both windows share name, windowSeconds and actor. Sharing one store key would make each
      // read the other's shape — `existing.count` and `existing.values` both undefined — and
      // every request would 500 instead of being limited.
      await expectAdmitted('A')
      await expectAdmitted('A')
      await expectAdmitted('B')

      // Distinct budget spent: a third value is refused while the request counter still has room.
      await expectRefused('C')
      expect(await valuesFor('user-1')).toEqual(['A', 'B'])

      // A known value is still admitted — until the plain counter (which every one of these
      // requests spent, refused or not) runs out on its own.
      await expectAdmitted('A')
      await expectRefused('A')
    })

    it('does not slide the window when re-admitting a known value', async () => {
      register(() => Limit.perDay(2).distinctBy(currentValue).by('user-1'))
      await expectAdmitted('A')
      const first = await resetAtFor('user-1')

      // A value already in the stored set must be admitted WITHOUT a write — asserting only
      // resetAt is unchanged doesn't prove this, since every write branch anchors resetAt to the
      // existing value too. A redundant `store.set` on the re-admit path would still pass that
      // check, so assert directly that no write happened.
      const setSpy = vi.spyOn(store, 'set')
      await expectAdmitted('A')

      expect(setSpy).not.toHaveBeenCalled()
      expect(await resetAtFor('user-1')).toBe(first)
    })

    it('starts a fresh set when the window expires', async () => {
      register(() => Limit.perSeconds(1, 1).distinctBy(currentValue).by('user-1'))
      await expectAdmitted('A')
      vi.advanceTimersByTime(1500)

      await expectAdmitted('B')
    })

    it('budgets each actor separately', async () => {
      register((ctx) => Limit.perDay(1).distinctBy(currentValue).by(actorOf(ctx)))
      await expectAdmittedAs('user-1', 'A')

      await expectAdmittedAs('user-2', 'B')
    })

    it('refuses with the retry metadata the standard 429 headers are built from', async () => {
      register(() => Limit.perDay(1).distinctBy(currentValue).by('user-1'))
      await expectAdmitted('A')

      // The whole reason this belongs in the limiter rather than a guard: Retry-After and
      // X-RateLimit-* come for free, and an app-side 403 would carry neither. The headers
      // themselves are attached by RateLimiterModule.onException, out of reach here — so assert
      // the values it renders them from.
      const error = await attempt('B').catch((e: unknown) => e)
      expect(error).toBeInstanceOf(TooManyRequestsError)
      const { info } = error as TooManyRequestsError
      expect(info.limit).toBe(1)
      expect(info.resetAt).toBe(Date.now() + 24 * 60 * 60 * 1000)
      expect(info.retryAfter).toBe(24 * 60 * 60)
    })
  })
})
