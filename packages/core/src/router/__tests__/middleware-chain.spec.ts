import { type Context } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import type { Constructor } from '../../types'
import { ROUTER_CONTEXT_KEYS } from '../constants'
import { RouterError } from '../router.error'
import type { Middleware, Next } from '../middleware.interface'
import { createMiddlewareChain } from '../middleware/middleware-chain'
import type { RouterContext } from '../router-context'
import type { RouterEnv } from '../types'

/**
 * Creates a minimal Hono context stub with a request container that
 * resolves middleware classes by instantiating them directly.
 */
function createContextStub() {
  const instances = new Map<Constructor<Middleware>, Middleware>()
  const container = {
    resolve: <T>(cls: Constructor<T>) => {
      if (!instances.has(cls as Constructor<Middleware>)) {
        instances.set(cls as Constructor<Middleware>, new (cls as Constructor<Middleware>)())
      }
      return instances.get(cls as Constructor<Middleware>) as T
    },
  }

  const vars = new Map<string, unknown>()
  vars.set(ROUTER_CONTEXT_KEYS.REQUEST_CONTAINER, container)

  const c = {
    get: (key: string) => vars.get(key),
    set: (key: string, value: unknown) => vars.set(key, value),
    req: { raw: new Request('http://localhost/test'), url: 'http://localhost/test', method: 'GET' },
    env: {},
  } as unknown as Context<RouterEnv>

  return c
}

// --- Middleware stubs ---

class DoubleNextMiddleware implements Middleware {
  async handle(_ctx: RouterContext, next: Next) {
    await next()
    await next()
  }
}

class DoubleNextInCatchMiddleware implements Middleware {
  async handle(_ctx: RouterContext, next: Next) {
    try {
      await next()
    } catch {
      await next()
    }
  }
}

class ResponseMiddleware implements Middleware {
  async handle(_ctx: RouterContext, _next: Next): Promise<Response> {
    return Promise.resolve(new Response('short-circuit', { status: 200 }))
  }
}

describe('createMiddlewareChain', () => {
  it('should call middlewares in registration order and then Hono next', async () => {
    const order: string[] = []

    class FirstMiddleware implements Middleware {
      async handle(_ctx: RouterContext, next: Next) {
        order.push('first:before')
        await next()
        order.push('first:after')
      }
    }

    class SecondMiddleware implements Middleware {
      async handle(_ctx: RouterContext, next: Next) {
        order.push('second:before')
        await next()
        order.push('second:after')
      }
    }

    const chain = createMiddlewareChain([
      FirstMiddleware as Constructor<Middleware>,
      SecondMiddleware as Constructor<Middleware>,
    ])

    const honoNext = vi.fn(async () => {
      order.push('hono:next')
      return Promise.resolve()
    })
    await chain(createContextStub(), honoNext)

    expect(order).toEqual(['first:before', 'second:before', 'hono:next', 'second:after', 'first:after'])
    expect(honoNext).toHaveBeenCalledOnce()
  })

  it('should return a Response when a middleware short-circuits', async () => {
    const chain = createMiddlewareChain([
      ResponseMiddleware as Constructor<Middleware>,
    ])

    const honoNext = vi.fn(async () => { /**/ })
    const result = await chain(createContextStub(), honoNext)

    expect(result).toBeInstanceOf(Response)
    expect(honoNext).not.toHaveBeenCalled()
  })

  it('should throw RouterError when next() is called twice', async () => {
    const chain = createMiddlewareChain([
      DoubleNextMiddleware as Constructor<Middleware>,
    ])

    const honoNext = vi.fn(async () => { /**/ })

    const err = await chain(createContextStub(), honoNext).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RouterError)
    expect((err as RouterError).message).toContain('DoubleNextMiddleware')
  })

  it('should throw RouterError when catch block re-calls next()', async () => {
    // Simulates the SessionVerificationMiddleware bug:
    // try { await next() } catch { await next() }
    // When a downstream error propagates, the catch re-invokes next().

    class DownstreamErrorMiddleware implements Middleware {
      async handle(_ctx: RouterContext, next: Next) {
        await next()
        throw new Error('downstream failure')
      }
    }

    const chain = createMiddlewareChain([
      DoubleNextInCatchMiddleware as Constructor<Middleware>,
      DownstreamErrorMiddleware as Constructor<Middleware>,
    ])

    const honoNext = vi.fn(async () => { /**/ })

    const err = await chain(createContextStub(), honoNext).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RouterError)
    expect((err as RouterError).message).toContain('DoubleNextInCatchMiddleware')
  })

  it('should work with an empty middleware array (just calls Hono next)', async () => {
    const chain = createMiddlewareChain([])
    const honoNext = vi.fn(async () => { /**/ })

    await chain(createContextStub(), honoNext)

    expect(honoNext).toHaveBeenCalledOnce()
  })

  it('should propagate downstream errors without masking them', async () => {
    class ErrorMiddleware implements Middleware {
      async handle(_ctx: RouterContext, next: Next) {
        await next()
      }
    }

    const chain = createMiddlewareChain([
      ErrorMiddleware as Constructor<Middleware>,
    ])

    const honoNext = vi.fn(() => {
      throw new Error('handler error')
    })

    await expect(chain(createContextStub(), honoNext)).rejects.toThrow('handler error')
  })
})
