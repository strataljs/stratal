import { describe, expect, it, vi } from 'vitest'
import { FeatureFlagError } from '../feature-flags.error'
import { FeatureFlagService } from '../services/feature-flag.service'
import type { FeatureFlagModuleOptions } from '../types'

/** A Flagship binding double whose methods echo the default they receive. */
function makeBinding() {
  return {
    get: vi.fn((_k: string, d?: unknown) => Promise.resolve(d)),
    getBooleanValue: vi.fn((_k: string, d: boolean) => Promise.resolve(d)),
    getStringValue: vi.fn((_k: string, d: string) => Promise.resolve(d)),
    getNumberValue: vi.fn((_k: string, d: number) => Promise.resolve(d)),
    getObjectValue: vi.fn((_k: string, d: object) => Promise.resolve(d)),
    getBooleanDetails: vi.fn((k: string, d: boolean) => Promise.resolve({ flagKey: k, value: d })),
    getStringDetails: vi.fn((k: string, d: string) => Promise.resolve({ flagKey: k, value: d })),
    getNumberDetails: vi.fn((k: string, d: number) => Promise.resolve({ flagKey: k, value: d })),
    getObjectDetails: vi.fn((k: string, d: object) => Promise.resolve({ flagKey: k, value: d })),
  }
}

function setup(options: Partial<FeatureFlagModuleOptions> = {}, ctx: unknown = null) {
  const flags = makeBinding()
  const experiment = makeBinding()
  const env = { FLAGS: flags, EXPERIMENT_FLAGS: experiment } as never
  const opts: FeatureFlagModuleOptions = {
    apps: [
      { binding: 'FLAGS', flags: { 'new-checkout': false, 'checkout-flow': 'v1', 'max-uploads': 5 } },
      { binding: 'EXPERIMENT_FLAGS', flags: { 'layout-v2': false } },
    ],
    default: 'FLAGS',
    ...options,
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- direct construction for unit testing (bypasses DI)
  const service = new FeatureFlagService(opts, env, ctx as any)
  return { service, flags, experiment }
}

describe('FeatureFlagService', () => {
  it('returns the binding value', async () => {
    const { service, flags } = setup()
    flags.getBooleanValue.mockResolvedValueOnce(true)
    expect(await service.getBooleanValue('new-checkout', false)).toBe(true)
  })

  it('uses the manifest default when none is provided', async () => {
    const { service, flags } = setup()
    await service.getStringValue('checkout-flow')
    expect(flags.getStringValue).toHaveBeenCalledWith('checkout-flow', 'v1', undefined)
  })

  it('lets an explicit default override the manifest', async () => {
    const { service, flags } = setup()
    await service.getNumberValue('max-uploads', 10)
    expect(flags.getNumberValue).toHaveBeenCalledWith('max-uploads', 10, undefined)
  })

  it('merges the default context into every evaluation', async () => {
    const { service, flags } = setup({ context: (c) => ({ userId: (c as unknown as { userId: string }).userId }) }, { userId: 'u1' })
    await service.getBooleanValue('new-checkout', false)
    expect(flags.getBooleanValue).toHaveBeenCalledWith('new-checkout', false, { userId: 'u1' })
  })

  it('lets per-call context override the default context', async () => {
    const { service, flags } = setup({ context: () => ({ userId: 'u1', plan: 'free' }) }, { userId: 'u1' })
    await service.getBooleanValue('new-checkout', false, { userId: 'u2' })
    expect(flags.getBooleanValue).toHaveBeenCalledWith('new-checkout', false, { userId: 'u2', plan: 'free' })
  })

  it('skips the default-context resolver outside request scope', async () => {
    const resolver = vi.fn(() => ({ userId: 'u1' }))
    const { service, flags } = setup({ context: resolver }, null)
    await service.getBooleanValue('new-checkout', false)
    expect(resolver).not.toHaveBeenCalled()
    expect(flags.getBooleanValue).toHaveBeenCalledWith('new-checkout', false, undefined)
  })

  it('evaluates the whole manifest in all(), choosing the method per type', async () => {
    const { service, flags } = setup()
    const result = await service.all()
    expect(result).toEqual({ 'new-checkout': false, 'checkout-flow': 'v1', 'max-uploads': 5 })
    expect(flags.getBooleanValue).toHaveBeenCalledWith('new-checkout', false, undefined)
    expect(flags.getStringValue).toHaveBeenCalledWith('checkout-flow', 'v1', undefined)
    expect(flags.getNumberValue).toHaveBeenCalledWith('max-uploads', 5, undefined)
  })

  it('switches apps with use() and stays immutable', async () => {
    const { service, experiment } = setup()
    const switched = service.use('EXPERIMENT_FLAGS')
    expect(switched).not.toBe(service)
    expect(service.app).toBe('FLAGS')
    expect(switched.app).toBe('EXPERIMENT_FLAGS')
    await switched.getBooleanValue('layout-v2')
    expect(experiment.getBooleanValue).toHaveBeenCalledWith('layout-v2', false, undefined)
  })

  it('returns the same instance when use() targets the current app', () => {
    const { service } = setup()
    expect(service.use('FLAGS')).toBe(service)
  })

  it('throws for an unknown app', () => {
    const { service } = setup()
    expect(() => service.use('NOPE')).toThrow(FeatureFlagError)
  })

  it('throws when the configured binding is missing from the environment', () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- env intentionally missing the binding
      new FeatureFlagService({ apps: [{ binding: 'FLAGS' }] }, {} as any, null as any),
    ).toThrow(FeatureFlagError)
  })
})
