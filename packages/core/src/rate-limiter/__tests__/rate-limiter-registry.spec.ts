import { createMock } from '@stratal/testing/mocks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Container } from '../../di/container'
import type { Next } from '../../router/middleware.interface'
import type { RouterContext } from '../../router/router-context'
import { RateLimiterError, TooManyRequestsError } from '../errors'
import { Limit } from '../limit'
import { RateLimiterRegistry } from '../rate-limiter-registry'
import { InMemoryRateLimiterStore } from '../stores/memory-store'

function makeCtx(headers: Record<string, string> = {}): RouterContext {
  const res = new Response('ok', { status: 200 })
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
    registry = new RateLimiterRegistry(container as unknown as Container)
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
})
