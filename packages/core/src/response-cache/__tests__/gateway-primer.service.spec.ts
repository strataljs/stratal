import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GatewayPrimerService } from '../services/gateway-primer.service'
import type { Middleware } from '../../router/middleware.interface'
import type { RouterContext } from '../../router/router-context'
import type { Container } from '../../di/container'

const logger = { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() }

describe('GatewayPrimerService', () => {
  let ctx: RouterContext

  beforeEach(() => {
    vi.clearAllMocks()
    ctx = {
      getContainer: vi.fn(),
    } as unknown as RouterContext
  })

  it('hasPrimers returns false when no primers registered', () => {
    const service = new GatewayPrimerService({ primers: undefined }, logger as any)
    expect(service.hasPrimers).toBe(false)
  })

  it('hasPrimers returns true when primers are registered', () => {
    const service = new GatewayPrimerService({ primers: [class Primer {}] } as any, logger as any)
    expect(service.hasPrimers).toBe(true)
  })

  it('runs every primer in registration order', async () => {
    const calls: string[] = []

    const Primer1 = class implements Middleware {
      handle() {
        calls.push('primer1')
        return Promise.resolve()
      }
    }
    const Primer2 = class implements Middleware {
      handle() {
        calls.push('primer2')
        return Promise.resolve()
      }
    }

    const container = {
      resolve: vi.fn((PrimerClass) => {
        if (PrimerClass === Primer1) return new Primer1()
        if (PrimerClass === Primer2) return new Primer2()
      }),
    } as unknown as Container

    ;(ctx.getContainer as any).mockReturnValue(container)
    const service = new GatewayPrimerService({ primers: [Primer1, Primer2] }, logger as any)

    await service.prime(ctx)

    expect(calls).toEqual(['primer1', 'primer2'])
  })

  it('passes a terminating next (no-op) to each primer', async () => {
    const nextCalls: unknown[] = []

    const Primer = class implements Middleware {
      async handle(_ctx: RouterContext, next: () => Promise<void>) {
        nextCalls.push(next)
        await next()
      }
    }

    const container = {
      resolve: vi.fn(() => new Primer()),
    } as unknown as Container

    ;(ctx.getContainer as any).mockReturnValue(container)
    const service = new GatewayPrimerService({ primers: [Primer] }, logger as any)

    await service.prime(ctx)

    expect(nextCalls).toHaveLength(1)
    const next = nextCalls[0] as () => Promise<void>
    expect(typeof next).toBe('function')
    // Terminating next should resolve (the async function is a no-op)
    await expect(next()).resolves.toBeUndefined()
  })

  describe('a primer that short-circuits with a Response', () => {
    const Rejecting = class implements Middleware {
      handle() {
        return Promise.resolve(new Response('unauthorized', { status: 401 }))
      }
    }

    function serviceFor(primers: unknown[], resolve: (P: unknown) => unknown) {
      const container = { resolve: vi.fn(resolve) } as unknown as Container
      ;(ctx.getContainer as any).mockReturnValue(container)
      return new GatewayPrimerService({ primers } as any, logger as any)
    }

    it('reports the chain as unprimed instead of returning the Response', async () => {
      const service = serviceFor([Rejecting], () => new Rejecting())

      await expect(service.prime(ctx)).resolves.toBe(false)
    })

    it('does not run later primers once one short-circuits', async () => {
      const calls: string[] = []
      const Later = class implements Middleware {
        handle() {
          calls.push('later')
          return Promise.resolve()
        }
      }

      const service = serviceFor([Rejecting, Later], (P) =>
        P === Rejecting ? new Rejecting() : new Later())

      await service.prime(ctx)

      expect(calls).toEqual([])
    })

    it('logs the short-circuit rather than discarding it silently', async () => {
      const service = serviceFor([Rejecting], () => new Rejecting())

      await service.prime(ctx)

      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('short-circuited'),
        expect.objectContaining({ status: 401 }),
      )
    })
  })

  it('reports the chain as primed when every primer runs to completion', async () => {
    const Primer = class implements Middleware {
      handle() { return Promise.resolve() }
    }
    const container = { resolve: vi.fn(() => new Primer()) } as unknown as Container
    ;(ctx.getContainer as any).mockReturnValue(container)
    const service = new GatewayPrimerService({ primers: [Primer] }, logger as any)

    await expect(service.prime(ctx)).resolves.toBe(true)
  })

  it('reports the chain as primed when there is nothing to prime', async () => {
    const service = new GatewayPrimerService({ primers: undefined }, logger as any)
    ;(ctx.getContainer as any).mockReturnValue({ resolve: vi.fn() })

    await expect(service.prime(ctx)).resolves.toBe(true)
  })
})
