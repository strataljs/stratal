import { Test, type TestingModule } from '@stratal/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GatewayAppModule } from '../fixtures/response-cache.controller'

/**
 * Workerd integration coverage for the response-cache **gateway**.
 *
 * `@stratal/testing` installs a `ctx.exports` stub by default
 * (`TestWorkerExports`) for the same reason it installs the `ctx.cache` one:
 * workerd never populates it, so an app configuring
 * `gateway: { entrypoint }` would otherwise fail its boot verification on the
 * first request of every consumer suite. The stub is not inert — a dispatched
 * request is re-run through the same Hono app with an unmarked execution
 * context carrying the resolved props, exactly as the real cached entrypoint
 * does — so what this file exercises is the genuine two-hop path, not a
 * short-circuit.
 *
 * The claim under test throughout is the one that makes the feature safe:
 * a partitioned route either reaches the cached entrypoint **with** its
 * partitions in `ctx.props`, or it does not reach it at all.
 */
describe('response-cache gateway: workerd integration', () => {
  let module: TestingModule

  beforeAll(async () => {
    module = await Test.createTestingModule({ imports: [GatewayAppModule] }).compile()
  })

  afterAll(async () => {
    await module.close()
  })

  it('forwards a partitioned @Cacheable GET with the resolved props', async () => {
    const before = module.gateway.loopbacks.length

    const response = await module.http
      .get('/gateway-demo/dashboard')
      .withHeaders({ 'x-user': 'u-42' })
      .send()

    response.assertOk()

    const dispatched = module.gateway.loopbacks.slice(before)
    expect(dispatched).toHaveLength(1)
    expect(dispatched[0].entrypoint).toBe('Cached')
    expect(dispatched[0].method).toBe('GET')
    expect(dispatched[0].props).toEqual({ user: 'u-42' })
  })

  it('caches the forwarded response inside the cached entrypoint', async () => {
    // The header comes from the cached-mode run, where the partitions really
    // are in the cache key — proving the loopback response is the one served.
    const response = await module.http
      .get('/gateway-demo/dashboard')
      .withHeaders({ 'x-user': 'u-7' })
      .send()

    response.assertHeader('Cache-Control', 'public, max-age=60')
  })

  it('gives two callers separate props, so their entries cannot collide', async () => {
    const before = module.gateway.loopbacks.length

    await module.http.get('/gateway-demo/dashboard').withHeaders({ 'x-user': 'alice' }).send()
    await module.http.get('/gateway-demo/dashboard').withHeaders({ 'x-user': 'bob' }).send()

    expect(module.gateway.loopbacks.slice(before).map((call) => call.props)).toEqual([
      { user: 'alice' },
      { user: 'bob' },
    ])
  })

  it('does not forward when a partition resolver returns null, and fails the response closed', async () => {
    const before = module.gateway.loopbacks.length

    const response = await module.http.get('/gateway-demo/dashboard').send()

    response.assertOk()
    response.assertHeader('Cache-Control', 'private, no-store')
    expect(module.gateway.loopbacks.slice(before)).toHaveLength(0)
  })

  it('does not forward when a partition resolver throws', async () => {
    const before = module.gateway.loopbacks.length

    const response = await module.http
      .get('/gateway-demo/dashboard')
      .withHeaders({ 'x-user': 'boom' })
      .send()

    response.assertOk()
    response.assertHeader('Cache-Control', 'private, no-store')
    expect(module.gateway.loopbacks.slice(before)).toHaveLength(0)
  })

  it('does not forward a @Cacheable route with no partitionBy', async () => {
    const before = module.gateway.loopbacks.length

    const response = await module.http.get('/gateway-demo/pricing').send()

    response.assertOk()
    response.assertHeader('Cache-Control', 'public, max-age=3600')
    expect(module.gateway.loopbacks.slice(before)).toHaveLength(0)
  })

  it('does not forward a POST, and routes its purge to the cached entrypoint', async () => {
    const beforeLoopbacks = module.gateway.loopbacks.length
    const beforePurges = module.cache.purges.length

    const response = await module.http.post('/gateway-demo/dashboard').send()

    response.assertOk()
    expect(module.gateway.loopbacks.slice(beforeLoopbacks)).toHaveLength(0)
    // Recorded on `module.cache.purges` whether it arrived over RPC or
    // directly, so a consumer's purge assertions read the same either way.
    expect(module.cache.purges.slice(beforePurges)).toEqual([{ tags: ['dashboard'] }])
  })
})
