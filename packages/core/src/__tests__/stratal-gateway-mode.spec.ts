import { afterEach, describe, expect, it, vi } from 'vitest'
import { boolean, object } from 'zod/mini'
import type { ApplicationConfig } from '../application'
import type { StratalEnv } from '../env'
import { LogLevel } from '../logger'
import { Module } from '../module/module.decorator'
import { isGatewayMode } from '../response-cache/gateway-mode'
import { Controller } from '../router/decorators/controller.decorator'
import { Route } from '../router/decorators/route.decorator'
import type { RouterContext } from '../router/router-context'
import { Stratal } from '../stratal'

// Stratal.prepareApp dynamically imports cloudflare:workers for env/waitUntil.
vi.mock('cloudflare:workers', () => ({
  env: { ENVIRONMENT: 'test' },
  waitUntil: vi.fn(),
}))

@Controller('/ping')
class PingController {
  @Route({ summary: 'Ping', response: object({ ok: boolean() }) })
  index(ctx: RouterContext) {
    return ctx.json({ ok: true })
  }
}

@Module({ controllers: [PingController] })
class TestAppModule {}

const config: ApplicationConfig = {
  module: TestAppModule,
  logging: { level: LogLevel.ERROR },
}

const mockEnv = { ENVIRONMENT: 'test' } as StratalEnv

function createCtx() {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext
}

/**
 * Without these, deleting `markGatewayMode(ctx)` from `Stratal.fetch` leaves
 * every other suite green while the whole gateway becomes a permanent
 * production no-op: the dispatch middleware would never see a marked context,
 * so every partitioned route would run inline forever. Fail-closed, so not a
 * leak — but silently dead, which is worse to discover in production than at
 * boot.
 */
describe('Stratal.fetch gateway marking', () => {
  let stratal: Stratal | undefined

  afterEach(async () => {
    await stratal?.shutdown()
    stratal = undefined
  })

  it('marks the execution context it hands to Hono as the gateway', async () => {
    stratal = new Stratal(config)
    const hono = await stratal.hono
    const fetchSpy = vi.spyOn(hono, 'fetch')

    await stratal.fetch(new Request('http://localhost/ping'), mockEnv, createCtx())

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const forwarded = fetchSpy.mock.calls[0][2]
    expect(isGatewayMode(forwarded)).toBe(true)
  })

  it('passes the runtime context through by identity, not a wrapper', async () => {
    // The mark lives in a WeakSet precisely so the runtime's own object —
    // with `exports`, `props`, `cache`, `access`, `tracing`, and whatever it
    // gains next — reaches Hono untouched. A wrapper would have to enumerate
    // those and would silently drop the ones it missed.
    stratal = new Stratal(config)
    const hono = await stratal.hono
    const fetchSpy = vi.spyOn(hono, 'fetch')
    const ctx = createCtx()

    await stratal.fetch(new Request('http://localhost/ping'), mockEnv, ctx)

    expect(fetchSpy.mock.calls[0][2]).toBe(ctx)
  })

  it('leaves a context it was never given unmarked', async () => {
    // The complement: marking is per-invocation, not global state, so the
    // context a cached entrypoint constructs is never accidentally marked.
    stratal = new Stratal(config)
    const untouched = createCtx()

    await stratal.fetch(new Request('http://localhost/ping'), mockEnv, createCtx())

    expect(isGatewayMode(untouched)).toBe(false)
  })

  it('still serves the request normally', async () => {
    stratal = new Stratal(config)

    const response = await stratal.fetch(
      new Request('http://localhost/ping'),
      mockEnv,
      createCtx(),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })
})
