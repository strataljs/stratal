import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Stratal } from '../../src/stratal'
import { isGatewayMode } from '../../src/response-cache/gateway-mode'
import type { PurgeSpec } from '../../src/response-cache/services/response-cache.service'
import { cachedEntrypoint } from '../../src/workers/cached-entrypoint'
import { GatewayAppModule } from '../fixtures/response-cache.controller'

/**
 * Coverage for `cachedEntrypoint` itself, against the **real**
 * `WorkerEntrypoint` from `cloudflare:workers`.
 *
 * It lives in the workerd project because that is the only place the real base
 * class exists — the node project aliases `cloudflare:workers` to a stub whose
 * `WorkerEntrypoint` has no `ctx`/`env` at all, so a unit test there would be
 * asserting against a different class than ships.
 *
 * Every other test in this feature drives a *stub* of the loopback binding.
 * Those stubs reimplement `fetch` and `purge`, so they prove the gateway calls
 * the right thing but say nothing about whether the thing being called works.
 * Deleting `purge` from `cachedEntrypoint`, or making its `fetch` mark gateway
 * mode, left every suite green before this file existed.
 */
describe('cachedEntrypoint: workerd integration', () => {
  let stratal: Stratal
  let Cached: ReturnType<typeof cachedEntrypoint>

  beforeAll(() => {
    stratal = new Stratal({ module: GatewayAppModule })
    Cached = cachedEntrypoint(stratal)
  })

  afterAll(async () => {
    await stratal.shutdown()
  })

  function purges(): { specs: PurgeSpec[]; cache: { purge(spec: PurgeSpec): Promise<{ success: boolean }> } } {
    const specs: PurgeSpec[] = []
    return {
      specs,
      cache: {
        purge: (spec: PurgeSpec) => {
          specs.push(spec)
          return Promise.resolve({ success: true })
        },
      },
    }
  }

  function createCtx(extra: Record<string, unknown> = {}) {
    return {
      waitUntil: () => { /* noop */ },
      passThroughOnException: () => { /* noop */ },
      props: {},
      ...extra,
    }
  }

  it('serves a request through the same Hono app', async () => {
    const ctx = createCtx({ cache: purges().cache, props: { user: 'u-1' } })
    const instance = new Cached(ctx as never, { ENVIRONMENT: 'test' } as never)

    const response = await instance.fetch(
      new Request('http://localhost/gateway-demo/pricing'),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it('does NOT mark its execution context, so it can never re-dispatch', async () => {
    // The single property that makes a loopback loop structurally impossible.
    const ctx = createCtx({ cache: purges().cache, props: { user: 'u-1' } })
    const instance = new Cached(ctx as never, { ENVIRONMENT: 'test' } as never)

    await instance.fetch(new Request('http://localhost/gateway-demo/pricing'))

    expect(isGatewayMode(ctx)).toBe(false)
  })

  it('caches a partitioned route when its props cover the declared partitions', async () => {
    const ctx = createCtx({ cache: purges().cache, props: { user: 'u-1' } })
    const instance = new Cached(ctx as never, { ENVIRONMENT: 'test' } as never)

    const response = await instance.fetch(
      new Request('http://localhost/gateway-demo/dashboard', {
        headers: { 'x-user': 'u-1' },
      }),
    )

    expect(response.headers.get('Cache-Control')).toBe('public, max-age=60')
  })

  it('fails a partitioned route closed when a caller supplies no props', async () => {
    const ctx = createCtx({ cache: purges().cache })
    const instance = new Cached(ctx as never, { ENVIRONMENT: 'test' } as never)

    const response = await instance.fetch(
      new Request('http://localhost/gateway-demo/dashboard', {
        headers: { 'x-user': 'u-1' },
      }),
    )

    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('purges its own ctx.cache over the RPC method', async () => {
    // The method the entire purge redirection depends on. Every other test
    // asserts against a stub that reimplements it.
    const recorder = purges()
    const instance = new Cached(createCtx({ cache: recorder.cache }) as never, {} as never)

    await instance.purge({ tags: ['dashboard'] })

    expect(recorder.specs).toEqual([{ tags: ['dashboard'] }])
  })

  it('throws a named config error when the entrypoint has no ctx.cache', async () => {
    // A mutation has already committed by the time a purge is forwarded, so
    // a missing `cache.enabled` on this entrypoint must be loud.
    const instance = new Cached(createCtx() as never, {} as never)

    await expect(instance.purge({ tags: ['dashboard'] })).rejects.toThrow(
      /cache.*enabled/i,
    )
  })
})
