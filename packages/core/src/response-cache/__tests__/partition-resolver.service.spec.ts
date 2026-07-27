import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResponseCacheConfigError } from '../errors'
import { PartitionResolverService } from '../services/partition-resolver.service'
import type { RouterContext } from '../../router/router-context'

const logger = { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() }
const ctx = {} as RouterContext

const make = (partitions: Record<string, unknown>) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow stubs
  new PartitionResolverService({ partitions } as any, logger as any)

describe('PartitionResolverService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns empty props and resolved=true for no declared partitions', async () => {
    expect(await make({}).resolve(ctx, [])).toEqual({ props: {}, resolved: true })
  })

  it('resolves a declared partition into props', async () => {
    const service = make({ user: () => 'u1' })
    expect(await service.resolve(ctx, ['user'])).toEqual({ props: { user: 'u1' }, resolved: true })
  })

  it('resolves several partitions', async () => {
    const service = make({ user: () => 'u1', tenant: () => 't1' })
    const result = await service.resolve(ctx, ['user', 'tenant'])
    expect(result.props).toEqual({ user: 'u1', tenant: 't1' })
  })

  it('awaits async resolvers', async () => {
    const service = make({ user: () => Promise.resolve('u1') })
    expect((await service.resolve(ctx, ['user'])).props).toEqual({ user: 'u1' })
  })

  it('only invokes the resolvers actually declared', async () => {
    const tenant = vi.fn(() => 't1')
    const service = make({ user: () => 'u1', tenant })
    await service.resolve(ctx, ['user'])
    expect(tenant).not.toHaveBeenCalled()
  })

  it('fails closed when a resolver returns null', async () => {
    const service = make({ user: () => null })
    expect(await service.resolve(ctx, ['user'])).toEqual({ props: {}, resolved: false })
  })

  it('fails closed when a resolver returns undefined', async () => {
    const service = make({ user: () => undefined })
    expect(await service.resolve(ctx, ['user'])).toEqual({ props: {}, resolved: false })
  })

  it('fails closed when a resolver throws, without propagating', async () => {
    const service = make({
      user: () => {
        throw new Error('UserNotAuthenticatedError')
      },
    })
    expect(await service.resolve(ctx, ['user'])).toEqual({ props: {}, resolved: false })
    expect(logger.debug).toHaveBeenCalled()
  })

  it('empties props entirely when an earlier partition resolved but a later one throws', async () => {
    const service = make({ tenant: () => 't1', user: () => { throw new Error('not authenticated') } })
    expect(await service.resolve(ctx, ['tenant', 'user'])).toEqual({ props: {}, resolved: false })
  })

  it('empties props entirely when an earlier partition resolved but a later one returns null', async () => {
    const service = make({ tenant: () => 't1', user: () => null })
    expect(await service.resolve(ctx, ['tenant', 'user'])).toEqual({ props: {}, resolved: false })
  })

  it('rejects an unknown partition name at boot', () => {
    expect(() => make({ user: () => 'u1' }).assertKnown(['nope'], 'PostsController.index')).toThrow(
      ResponseCacheConfigError,
    )
  })

  it('accepts known partition names at boot', () => {
    expect(() => make({ user: () => 'u1' }).assertKnown(['user'], 'PostsController.index')).not.toThrow()
  })
})

describe('PartitionResolverService: never-resolved diagnostics', () => {
  beforeEach(() => vi.clearAllMocks())

  it('warns once when a partition has never resolved', async () => {
    // The forgotten-primers case: `ctx.user()` throws on every request, the
    // route is never cached, and the per-request signal is only at `debug`.
    const service = make({ user: () => { throw new Error('no auth context') } })

    await service.resolve(ctx, ['user'])
    await service.resolve(ctx, ['user'])
    await service.resolve(ctx, ['user'])

    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.warn.mock.calls[0][0]).toMatch(/never resolved.*primers/s)
  })

  it('does not warn for a partition that resolved at least once', async () => {
    // An anonymous visitor to a per-user route is ordinary traffic, not a
    // misconfiguration, so a later miss must stay quiet.
    let value: string | null = 'u-1'
    const service = make({ user: () => value })

    await service.resolve(ctx, ['user'])
    value = null
    await service.resolve(ctx, ['user'])

    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('warns per partition name rather than once globally', async () => {
    const service = make({ user: () => null, tenant: () => null })

    await service.resolve(ctx, ['user'])
    await service.resolve(ctx, ['tenant'])

    expect(logger.warn).toHaveBeenCalledTimes(2)
  })
})
