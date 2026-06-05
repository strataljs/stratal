import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Container } from '../../di/container'
import type { Middleware, Next } from '../../router/middleware.interface'
import type { RouterContext } from '../../router/router-context'
import { RateLimiterError } from '../errors'
import type { RateLimiterRegistry } from '../rate-limiter-registry'
import { RATE_LIMITER_TOKENS } from '../rate-limiter.tokens'
import { _resetThrottleMiddlewareCache, createThrottleMiddleware } from '../throttle.middleware'

describe('createThrottleMiddleware', () => {
  afterEach(() => {
    _resetThrottleMiddlewareCache()
  })

  it('returns the same class on repeat calls with the same name (memoized)', () => {
    const a = createThrottleMiddleware('api')
    const b = createThrottleMiddleware('api')
    expect(a).toBe(b)
  })

  it('returns different classes for different names', () => {
    expect(createThrottleMiddleware('api')).not.toBe(createThrottleMiddleware('uploads'))
  })

  it('uses a debug-friendly class name', () => {
    expect(createThrottleMiddleware('writes').name).toBe('Throttle(writes)')
  })

  it('throws RateLimiterError when the per-app marker is not registered', () => {
    const container = createMock<Container>()
    container.isRegistered.mockReturnValue(false)

    const Cls = createThrottleMiddleware('orphan')
    const middleware: Middleware = new Cls(container as unknown as Container)
    const next: Next = vi.fn((): Promise<void> => Promise.resolve())

    expect(() => middleware.handle({} as RouterContext, next))
      .toThrow(RateLimiterError)
    expect(container.isRegistered).toHaveBeenCalledWith(RATE_LIMITER_TOKENS.ModuleMarker)
    expect(next).not.toHaveBeenCalled()
  })

  it('delegates to RateLimiterRegistry.handle when the marker is present', async () => {
    const registry = { handle: vi.fn().mockResolvedValue(undefined) }
    const container: DeepMocked<Container> = createMock<Container>()
    container.isRegistered.mockReturnValue(true)
    container.resolve.mockReturnValue(registry as unknown as RateLimiterRegistry)

    const Cls = createThrottleMiddleware('happy')
    const middleware: Middleware = new Cls(container as unknown as Container)
    const next: Next = vi.fn((): Promise<void> => Promise.resolve())

    await middleware.handle({} as RouterContext, next)
    expect(registry.handle).toHaveBeenCalledWith('happy', {}, next)
  })
})
