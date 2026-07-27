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

/**
 * Forwards control with `await next()` but does NOT return next()'s value — the
 * common, easy-to-write pattern. An inner middleware's short-circuit Response
 * must not be silently dropped by an outer middleware shaped like this.
 */
class ForwardingMiddleware implements Middleware {
  async handle(_ctx: RouterContext, next: Next) {
    await next()
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
      FirstMiddleware,
      SecondMiddleware,
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
      ResponseMiddleware,
    ])

    const honoNext = vi.fn(async () => { /**/ })
    const result = await chain(createContextStub(), honoNext)

    expect(result).toBeInstanceOf(Response)
    expect(honoNext).not.toHaveBeenCalled()
  })

  it('should throw RouterError when next() is called twice', async () => {
    const chain = createMiddlewareChain([
      DoubleNextMiddleware,
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
      DoubleNextInCatchMiddleware,
      DownstreamErrorMiddleware,
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
      ErrorMiddleware,
    ])

    const honoNext = vi.fn(() => {
      throw new Error('handler error')
    })

    await expect(chain(createContextStub(), honoNext)).rejects.toThrow('handler error')
  })

  it('finalizes c.res when an inner middleware returns a Response and an outer middleware forwards with `await next()`', async () => {
    // An outer middleware that does `await next()` (rather than `return next()`)
    // drops the inner middleware's returned Response. Without finalizing the
    // Response on the context, Hono is left with an unfinalized context and
    // throws "Context is not finalized". The chain must set `c.res` so the
    // short-circuit survives regardless of how outer middlewares forward.
    const c = createContextStub()
    const chain = createMiddlewareChain([
      ForwardingMiddleware,
      ResponseMiddleware,
    ])

    const honoNext = vi.fn(async () => { /**/ })
    await chain(c, honoNext)

    expect(c.res).toBeInstanceOf(Response)
    expect(c.res.status).toBe(200)
    // The inner middleware short-circuited, so the terminal Hono handler never ran.
    expect(honoNext).not.toHaveBeenCalled()
  })

  it('finalizes c.res across separately-composed chains (outer chain forwards with `await next()`)', async () => {
    // Mirrors the real failure: a global `router.use` chain whose middlewares
    // forward with `await next()` wraps a *second* `router.use` chain that
    // short-circuits. The inner chain must finalize its Response so the outer
    // chain's bare `await next()` can't strand it.
    const c = createContextStub()
    const innerChain = createMiddlewareChain([ResponseMiddleware])
    const outerChain = createMiddlewareChain([ForwardingMiddleware])

    // Hono runs the outer chain first; its `next` advances into the inner chain.
    await outerChain(c, async () => {
      await innerChain(c, async () => { /**/ })
    })

    expect(c.res).toBeInstanceOf(Response)
    expect(c.res.status).toBe(200)
  })
})
