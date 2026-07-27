import { afterEach, describe, expect, it, vi } from 'vitest'
import { boolean, object } from 'zod/mini'
import { Application } from '../../application'
import { Transient } from '../../di/decorators'
import type { StratalEnv } from '../../env'
import type { CanActivate } from '../../guards'
import { UseGuards } from '../../guards'
import { LogLevel } from '../../logger'
import { Module } from '../../module/module.decorator'
import { Cacheable, PurgesCache } from '../../response-cache/decorators'
import { markGatewayMode } from '../../response-cache/gateway-mode'
import { ResponseCacheModule } from '../../response-cache/response-cache.module'
import type { PurgeSpec } from '../../response-cache/services/response-cache.service'
import { Controller, Get, Post } from '../decorators'
import type { Middleware, Next } from '../middleware.interface'
import type { RouterContext } from '../router-context'

// ── Fixtures ──────────────────────────────────────────────────────────

/**
 * Header-driven so a test can make the `user` partition resolve, return
 * `null`, or throw, on a per-request basis — the three branches
 * `PartitionResolverService` distinguishes.
 */
function userPartition(ctx: RouterContext): string | null {
  const header = ctx.c.req.header('x-user')
  if (header === 'boom') throw new Error('resolver exploded')
  return header ?? null
}

@Transient()
class AlwaysAllowGuard implements CanActivate {
  canActivate(): boolean {
    return true
  }
}

@Controller('/gw')
class GatewayController {
  @Get('/dashboard', { response: object({ ok: boolean() }) })
  @Cacheable({ ttl: 60, partitionBy: ['user'] })
  dashboard(ctx: RouterContext) {
    return ctx.json({ ok: true })
  }

  @Get('/guarded', { response: object({ ok: boolean() }) })
  @UseGuards(AlwaysAllowGuard)
  @Cacheable({ ttl: 60, partitionBy: ['user'] })
  guarded(ctx: RouterContext) {
    return ctx.json({ ok: true })
  }

  @Get('/pricing', { response: object({ ok: boolean() }) })
  @Cacheable({ ttl: 3600 })
  pricing(ctx: RouterContext) {
    return ctx.json({ ok: true })
  }

  @Get('/plain', { response: object({ ok: boolean() }) })
  plain(ctx: RouterContext) {
    return ctx.json({ ok: true })
  }

  @Post('/dashboard', { response: object({ ok: boolean() }) })
  @Cacheable({ ttl: 60, partitionBy: ['user'] })
  @PurgesCache({ tags: ['dashboard'] })
  write(ctx: RouterContext) {
    return ctx.json({ ok: true })
  }
}

@Module({
  controllers: [GatewayController],
  imports: [
    ResponseCacheModule.forRoot({
      gateway: { entrypoint: 'Cached' },
      partitions: { user: userPartition },
    }),
  ],
})
class GatewayModule {}

/**
 * Two partitioned patterns that both match `/reports/summary`, partitioned
 * *differently*.
 *
 * Static-before-parameterised is the ordinary registration order, so a request
 * to `/reports/summary` matches `/reports/summary` (which will run) and
 * `/reports/:id` (which will not). Selecting the wrong one sends the wrong
 * `partitionBy` — and the cached entrypoint then stores a per-user response
 * under a tenant-only key, serving one user's page to everyone in that tenant.
 */
@Controller('/reports')
class OverlappingController {
  @Get('/summary', { response: object({ route: boolean() }) })
  @Cacheable({ ttl: 60, partitionBy: ['user'] })
  summary(ctx: RouterContext) {
    return ctx.json({ route: true })
  }

  @Get('/:id', { response: object({ route: boolean() }) })
  @Cacheable({ ttl: 60, partitionBy: ['tenant'] })
  show(ctx: RouterContext) {
    return ctx.json({ route: true })
  }
}

@Module({
  controllers: [OverlappingController],
  imports: [
    ResponseCacheModule.forRoot({
      gateway: { entrypoint: 'Cached' },
      partitions: {
        user: userPartition,
        tenant: (ctx: RouterContext) => ctx.c.req.header('x-tenant') ?? null,
      },
    }),
  ],
})
class OverlappingGatewayModule {}

/** Marks that a primer ran, so the "primers run before resolution" claim is observable. */
const primerRuns: string[] = []

@Transient()
class RecordingPrimer implements Middleware {
  async handle(ctx: RouterContext, next: Next): Promise<void> {
    primerRuns.push(ctx.c.req.path)
    await next()
  }
}

@Transient()
class ShortCircuitPrimer implements Middleware {
  async handle(): Promise<Response> {
    return Promise.resolve(new Response('nope', { status: 401 }))
  }
}

@Module({
  controllers: [GatewayController],
  imports: [
    ResponseCacheModule.forRoot({
      gateway: { entrypoint: 'Cached' },
      partitions: { user: userPartition },
      primers: [RecordingPrimer],
    }),
  ],
})
class PrimedGatewayModule {}

@Module({
  controllers: [GatewayController],
  imports: [
    ResponseCacheModule.forRoot({
      gateway: { entrypoint: 'Cached' },
      partitions: { user: userPartition },
      primers: [ShortCircuitPrimer],
    }),
  ],
})
class ShortCircuitGatewayModule {}

/** Names an entrypoint this Worker does not export — the typo case. */
@Module({
  controllers: [GatewayController],
  imports: [
    ResponseCacheModule.forRoot({
      gateway: { entrypoint: 'Cachd' },
      partitions: { user: userPartition },
    }),
  ],
})
class TypoGatewayModule {}

// ── Harness ───────────────────────────────────────────────────────────

const mockEnv = { ENVIRONMENT: 'test' } as StratalEnv

interface LoopbackCall {
  props: Record<string, string>
  method: string
  url: string
}

/**
 * A stand-in for the `ctx.exports.<Name>` loopback binding.
 *
 * Shaped like the real one — `LoopbackServiceStub<T>` is
 * `Fetcher<T> & ((opts: { props }) => Fetcher<T>)` — so the callable form the
 * dispatch middleware uses to select `ctx.props` is exercised rather than
 * assumed.
 */
function createExportStub(calls: LoopbackCall[], purges: PurgeSpec[]) {
  const stubFor = (props: Record<string, string>) => ({
    fetch: (request: Request) => {
      calls.push({ props, method: request.method, url: request.url })
      return Promise.resolve(
        new Response(JSON.stringify({ from: 'cached-entrypoint' }), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
        }),
      )
    },
    purge: (spec: PurgeSpec) => {
      purges.push(spec)
      return Promise.resolve({ success: true })
    },
  })

  return Object.assign(
    (options?: { props?: Record<string, string> }) => stubFor(options?.props ?? {}),
    stubFor({}),
  )
}

interface Harness {
  calls: LoopbackCall[]
  loopbackPurges: PurgeSpec[]
  directPurges: PurgeSpec[]
  ctx: ExecutionContext
}

/**
 * @param mode `'gateway'` marks the execution context the way `Stratal.fetch`
 *   does; `'cached'` leaves it unmarked, exactly as `cachedEntrypoint` does.
 * @param exportName the key the stub is published under on `ctx.exports`.
 */
function createHarness(
  mode: 'gateway' | 'cached',
  exportName = 'Cached',
  options: { withCache?: boolean; props?: Record<string, unknown> } = {},
): Harness {
  const calls: LoopbackCall[] = []
  const loopbackPurges: PurgeSpec[] = []
  const directPurges: PurgeSpec[] = []

  const cache = { purge: (spec: PurgeSpec) => { directPurges.push(spec); return Promise.resolve({ success: true }) } }

  const ctx = {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    exports: { [exportName]: createExportStub(calls, loopbackPurges) },
    // What the gateway chose for this invocation. Only meaningful in cached
    // mode, where `partitionsResolved` verifies it covers the route's
    // declared partitions instead of trusting the caller.
    props: options.props,
    // The cached entrypoint is the one Wrangler gives `cache.enabled: true`.
    // Present in both modes by default so that a purge landing here rather
    // than on the loopback is *observable* instead of merely throwing; pass
    // `withCache: false` for the real gateway config, where it is absent.
    ...(options.withCache === false ? {} : { cache }),
  }

  if (mode === 'gateway') markGatewayMode(ctx)

  return { calls, loopbackPurges, directPurges, ctx: ctx as unknown as ExecutionContext }
}

function createApp(module: new () => object = GatewayModule) {
  return new Application({
    module,
    logging: { level: LogLevel.ERROR },
    env: mockEnv,
    ctx: { waitUntil: vi.fn() },
  })
}

async function fetchPath(
  app: Application,
  path: string,
  ctx: ExecutionContext,
  init?: RequestInit,
) {
  await app.initialize()
  const hono = await app.ensureHono()
  return hono.fetch(new Request(`http://localhost${path}`, init), mockEnv, ctx)
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('gateway dispatch wiring', () => {
  let app: Application

  afterEach(async () => {
    primerRuns.length = 0
    await app.shutdown()
  })

  describe('gateway mode', () => {
    it('forwards a partitioned @Cacheable GET to ctx.exports with the resolved props', async () => {
      app = createApp()
      const harness = createHarness('gateway')

      const res = await fetchPath(app, '/gw/dashboard', harness.ctx, {
        headers: { 'x-user': 'u-42' },
      })

      expect(harness.calls).toHaveLength(1)
      expect(harness.calls[0].props).toEqual({ user: 'u-42' })
      expect(harness.calls[0].url).toBe('http://localhost/gw/dashboard')
      expect(await res.json()).toEqual({ from: 'cached-entrypoint' })
    })

    it('gives two callers different props, so their entries cannot collide', async () => {
      app = createApp()
      const harness = createHarness('gateway')

      await fetchPath(app, '/gw/dashboard', harness.ctx, { headers: { 'x-user': 'alice' } })
      await fetchPath(app, '/gw/dashboard', harness.ctx, { headers: { 'x-user': 'bob' } })

      expect(harness.calls.map((call) => call.props)).toEqual([{ user: 'alice' }, { user: 'bob' }])
    })

    it('forwards a partitioned guarded route without running its guards in the gateway', async () => {
      // Guards run in the app, not the gateway — on a cache hit the app never
      // runs at all, so anything the gateway ran would be work a hit skips.
      app = createApp()
      const harness = createHarness('gateway')

      await fetchPath(app, '/gw/guarded', harness.ctx, { headers: { 'x-user': 'u-1' } })

      expect(harness.calls).toHaveLength(1)
      expect(harness.calls[0].props).toEqual({ user: 'u-1' })
    })

    it('runs a POST inline — a mutation never loops back', async () => {
      app = createApp()
      const harness = createHarness('gateway')

      const res = await fetchPath(app, '/gw/dashboard', harness.ctx, {
        method: 'POST',
        headers: { 'x-user': 'u-42' },
      })

      expect(harness.calls).toHaveLength(0)
      expect(await res.json()).toEqual({ ok: true })
    })

    it('runs inline when a partition resolver returns null', async () => {
      app = createApp()
      const harness = createHarness('gateway')

      // No `x-user` header, so `userPartition` returns null.
      const res = await fetchPath(app, '/gw/dashboard', harness.ctx)

      expect(harness.calls).toHaveLength(0)
      expect(await res.json()).toEqual({ ok: true })
    })

    it('stamps the inline response of an unresolved partition private, no-store', async () => {
      // Fail-closed end to end: not forwarded, and not cacheable where it ran.
      app = createApp()
      const harness = createHarness('gateway')

      const res = await fetchPath(app, '/gw/dashboard', harness.ctx)

      expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    })

    it('runs inline when a partition resolver throws', async () => {
      app = createApp()
      const harness = createHarness('gateway')

      const res = await fetchPath(app, '/gw/dashboard', harness.ctx, {
        headers: { 'x-user': 'boom' },
      })

      expect(harness.calls).toHaveLength(0)
      expect(res.status).toBe(200)
      expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    })

    it('runs a @Cacheable route with no partitionBy inline', async () => {
      app = createApp()
      const harness = createHarness('gateway')

      const res = await fetchPath(app, '/gw/pricing', harness.ctx)

      expect(harness.calls).toHaveLength(0)
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600')
    })

    it('runs a route with no cache decorators inline', async () => {
      app = createApp()
      const harness = createHarness('gateway')

      const res = await fetchPath(app, '/gw/plain', harness.ctx)

      expect(harness.calls).toHaveLength(0)
      expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    })

    it('runs an unmatched path inline rather than forwarding a 404', async () => {
      app = createApp()
      const harness = createHarness('gateway')

      const res = await fetchPath(app, '/gw/nope', harness.ctx)

      expect(harness.calls).toHaveLength(0)
      expect(res.status).toBe(404)
    })

    it('uses the partitions of the route that will actually run, not another matching pattern', async () => {
      // `/reports/summary` and `/reports/:id` both match, and they are
      // partitioned differently. Forwarding `/reports/:id`'s `tenant` would
      // store a per-user summary under a tenant-only key — every user in that
      // tenant then receives the first one's page.
      app = createApp(OverlappingGatewayModule)
      const harness = createHarness('gateway')

      await fetchPath(app, '/reports/summary', harness.ctx, {
        headers: { 'x-user': 'u-1', 'x-tenant': 't-1' },
      })

      expect(harness.calls).toHaveLength(1)
      expect(harness.calls[0].props).toEqual({ user: 'u-1' })
    })

    it('still selects the parameterised route when that is the one that runs', async () => {
      app = createApp(OverlappingGatewayModule)
      const harness = createHarness('gateway')

      await fetchPath(app, '/reports/42', harness.ctx, {
        headers: { 'x-user': 'u-1', 'x-tenant': 't-1' },
      })

      expect(harness.calls).toHaveLength(1)
      expect(harness.calls[0].props).toEqual({ tenant: 't-1' })
    })

    it('runs primers before resolving partitions', async () => {
      app = createApp(PrimedGatewayModule)
      const harness = createHarness('gateway')

      await fetchPath(app, '/gw/dashboard', harness.ctx, { headers: { 'x-user': 'u-7' } })

      expect(primerRuns).toEqual(['/gw/dashboard'])
      expect(harness.calls).toHaveLength(1)
    })

    it('does not run primers for an unpartitioned cacheable route', async () => {
      app = createApp(PrimedGatewayModule)
      const harness = createHarness('gateway')

      await fetchPath(app, '/gw/pricing', harness.ctx)

      expect(primerRuns).toEqual([])
    })

    it('runs inline when a primer short-circuits, rather than answering from the gateway', async () => {
      app = createApp(ShortCircuitGatewayModule)
      const harness = createHarness('gateway')

      const res = await fetchPath(app, '/gw/dashboard', harness.ctx, {
        headers: { 'x-user': 'u-42' },
      })

      expect(harness.calls).toHaveLength(0)
      // The primer's own 401 is dropped: the real chain runs inside the app.
      expect(res.status).toBe(200)
      expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    })
  })

  describe('cached mode (the loopback target running the same Hono app)', () => {
    it('does not re-dispatch a partitioned @Cacheable GET', async () => {
      app = createApp()
      const harness = createHarness('cached')

      const res = await fetchPath(app, '/gw/dashboard', harness.ctx, {
        headers: { 'x-user': 'u-42' },
      })

      expect(harness.calls).toHaveLength(0)
      expect(await res.json()).toEqual({ ok: true })
    })

    it('caches the partitioned response it produces when props cover its partitions', async () => {
      app = createApp()
      const harness = createHarness('cached', 'Cached', { props: { user: 'u-42' } })

      const res = await fetchPath(app, '/gw/dashboard', harness.ctx, {
        headers: { 'x-user': 'u-42' },
      })

      expect(res.headers.get('Cache-Control')).toBe('public, max-age=60')
    })

    it('fails closed when a caller reaches it with no props at all', async () => {
      // Another Worker's service binding, or a misrouted export. The
      // entrypoint must not take "I was called" as proof of partitioning.
      app = createApp()
      const harness = createHarness('cached')

      const res = await fetchPath(app, '/gw/dashboard', harness.ctx, {
        headers: { 'x-user': 'u-42' },
      })

      expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    })

    it('fails closed when props cover only some of the declared partitions', async () => {
      app = createApp(OverlappingGatewayModule)
      const harness = createHarness('cached', 'Cached', { props: { tenant: 't-1' } })

      // `/reports/summary` declares `['user']`; the props name `tenant`.
      // This is the shape a mis-selected binding would produce.
      const res = await fetchPath(app, '/reports/summary', harness.ctx, {
        headers: { 'x-user': 'u-1', 'x-tenant': 't-1' },
      })

      expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    })
  })

  describe('no execution context at all', () => {
    /**
     * `hono.fetch(request, env)` with no third argument — what `quarry api`
     * and `mcp serve` do.
     *
     * The first request of an isolate would fail the `assertCachingAvailable`
     * boot check here (no `ctx.cache`), which latches. So each test drives one
     * normal request first: that latches the check as *passed*, and every
     * later context-less request then sails through to `applyCacheDecision`.
     * That is the genuinely reachable path, and testing it without the warm-up
     * would only re-prove the boot check.
     */
    async function warmThenFetchWithoutContext(path: string, init?: RequestInit) {
      const harness = createHarness('cached', 'Cached', { props: { user: 'warm' } })
      await fetchPath(app, '/gw/pricing', harness.ctx)

      const hono = await app.ensureHono()
      return hono.fetch(new Request(`http://localhost${path}`, init), mockEnv)
    }

    it('fails a partitioned route closed rather than stamping it public', async () => {
      // There is no way to tell "gateway declined" from "cached entrypoint
      // with props" without a context, and unknown must mean uncacheable.
      app = createApp()

      const res = await warmThenFetchWithoutContext('/gw/dashboard', {
        headers: { 'x-user': 'u-42' },
      })

      expect(res.status).toBe(200)
      expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    })

    it('still caches an unpartitioned route, which needs no context to be safe', async () => {
      // Proves the rule above is scoped to partitioned routes rather than
      // being a blanket "no context, no caching" rejection.
      app = createApp()

      const res = await warmThenFetchWithoutContext('/gw/pricing')

      expect(res.status).toBe(200)
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600')
    })
  })

  describe('purge routing', () => {
    it('sends a gateway-mode purge to the cached entrypoint over RPC, not to its own cache', async () => {
      // The gateway's Wrangler config sets `cache.enabled: false`, and purges
      // are scoped to the entrypoint that issues them — an inline purge here
      // would invalidate nothing.
      app = createApp()
      const harness = createHarness('gateway')

      await fetchPath(app, '/gw/dashboard', harness.ctx, {
        method: 'POST',
        headers: { 'x-user': 'u-42' },
      })

      expect(harness.loopbackPurges).toEqual([{ tags: ['dashboard'] }])
      expect(harness.directPurges).toEqual([])
    })

    it('boots and purges on a gateway that has no ctx.cache of its own', async () => {
      // The real gateway config: `"default": { "cache": { "enabled": false } }`,
      // so `ctx.cache` is absent. Without the RPC redirection the boot check
      // (`assertCachingAvailable`) would 500 the very first request of every
      // gateway app, and the purge would have nothing to call.
      app = createApp()
      const harness = createHarness('gateway', 'Cached', { withCache: false })

      const res = await fetchPath(app, '/gw/dashboard', harness.ctx, {
        method: 'POST',
        headers: { 'x-user': 'u-42' },
      })

      expect(res.status).toBe(200)
      expect(harness.loopbackPurges).toEqual([{ tags: ['dashboard'] }])
    })

    it('purges its own cache directly when running as the cached entrypoint', async () => {
      app = createApp()
      const harness = createHarness('cached')

      await fetchPath(app, '/gw/dashboard', harness.ctx, {
        method: 'POST',
        headers: { 'x-user': 'u-42' },
      })

      expect(harness.directPurges).toEqual([{ tags: ['dashboard'] }])
      expect(harness.loopbackPurges).toEqual([])
    })
  })

  describe('boot verification of the configured entrypoint', () => {
    // The thrown `ResponseCacheConfigError` reaches the application's own
    // exception handler, which renders it as a 500 — the same shape
    // `assertCachingAvailable`'s boot failure already takes. What matters is
    // that a typo'd entrypoint fails every request loudly instead of running
    // every partitioned route inline forever with no signal.
    it('fails the very first request when ctx.exports has no such export', async () => {
      app = createApp(TypoGatewayModule)
      const harness = createHarness('gateway')

      const res = await fetchPath(app, '/gw/plain', harness.ctx)

      expect(res.status).toBe(500)
    })

    it('keeps failing on later requests rather than silently running inline forever', async () => {
      app = createApp(TypoGatewayModule)
      const harness = createHarness('gateway')

      expect((await fetchPath(app, '/gw/plain', harness.ctx)).status).toBe(500)
      expect((await fetchPath(app, '/gw/dashboard', harness.ctx, {
        headers: { 'x-user': 'u-1' },
      })).status).toBe(500)
      expect(harness.calls).toHaveLength(0)
    })

    it('does not run the check at all in cached mode', async () => {
      // The cached entrypoint has no reason to reach `ctx.exports`, so a
      // gateway-only misconfiguration must not take it down too.
      app = createApp(TypoGatewayModule)
      const harness = createHarness('cached')

      const res = await fetchPath(app, '/gw/plain', harness.ctx)

      expect(res.status).toBe(200)
    })
  })
})
