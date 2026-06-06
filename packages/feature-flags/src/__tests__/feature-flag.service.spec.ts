import type { StratalEnv } from 'stratal'
import { Container, DI_TOKENS } from 'stratal/di'
import { JsonFormatter, LogLevel, LoggerService } from 'stratal/logger'
import { ROUTER_TOKENS, type RouterContext } from 'stratal/router'
import { describe, expect, it, vi } from 'vitest'
import { FeatureFlagError } from '../feature-flags.error'
import { FEATURE_FLAG_TOKENS } from '../feature-flags.tokens'
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

type FlagshipDouble = ReturnType<typeof makeBinding>

// The documented consumer pattern (see stratal's env.ts): augment StratalEnv with
// the bindings the suite uses, so test envs type-check instead of being cast away.
declare module 'stratal' {
  interface StratalEnv {
    FLAGS: FlagshipDouble
    EXPERIMENT_FLAGS: FlagshipDouble
  }
}

function makeEnv(flags: FlagshipDouble, experiment: FlagshipDouble): StratalEnv {
  return { ENVIRONMENT: 'test', CACHE: {} as KVNamespace, FLAGS: flags, EXPERIMENT_FLAGS: experiment }
}

/** A real LoggerService with `warn` spied and silenced. */
function makeLogger() {
  const logger = new LoggerService(LogLevel.WARN, new JsonFormatter())
  vi.spyOn(logger, 'warn').mockReturnValue(undefined)
  return logger
}

function makeOptions(options: Partial<FeatureFlagModuleOptions> = {}): FeatureFlagModuleOptions {
  return {
    apps: [
      { binding: 'FLAGS', flags: { 'new-checkout': false, 'checkout-flow': 'v1', 'max-uploads': 5 } },
      { binding: 'EXPERIMENT_FLAGS', flags: { 'layout-v2': false } },
    ],
    default: 'FLAGS',
    ...options,
  }
}

function setup(options: Partial<FeatureFlagModuleOptions> = {}, ctx: RouterContext | undefined = undefined) {
  const flags = makeBinding()
  const experiment = makeBinding()
  const logger = makeLogger()
  const service = new FeatureFlagService(makeOptions(options), makeEnv(flags, experiment), ctx, logger)
  return { service, flags, experiment, logger }
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
    const { service, flags } = setup({ context: (c) => ({ userId: (c as unknown as { userId: string }).userId }) }, { userId: 'u1' } as unknown as RouterContext)
    await service.getBooleanValue('new-checkout', false)
    expect(flags.getBooleanValue).toHaveBeenCalledWith('new-checkout', false, { userId: 'u1' })
  })

  it('lets per-call context override the default context', async () => {
    const { service, flags } = setup({ context: () => ({ userId: 'u1', plan: 'free' }) }, { userId: 'u1' } as unknown as RouterContext)
    await service.getBooleanValue('new-checkout', false, { userId: 'u2' })
    expect(flags.getBooleanValue).toHaveBeenCalledWith('new-checkout', false, { userId: 'u2', plan: 'free' })
  })

  it('skips the default-context resolver outside request scope', async () => {
    const resolver = vi.fn(() => ({ userId: 'u1' }))
    const { service, flags } = setup({ context: resolver }, undefined)
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
      // env intentionally missing the FLAGS binding
      new FeatureFlagService({ apps: [{ binding: 'FLAGS' }] }, { ENVIRONMENT: 'test', CACHE: {} as KVNamespace } as StratalEnv, undefined, undefined),
    ).toThrow(FeatureFlagError)
  })

  describe('binding failure resilience', () => {
    const tunnelDown = new Error('WebSocket connection failed.')

    it('returns the explicit default when the binding rejects', async () => {
      const { service, flags } = setup()
      flags.getBooleanValue.mockRejectedValueOnce(tunnelDown)
      expect(await service.getBooleanValue('new-checkout', true)).toBe(true)
    })

    it('returns the manifest default when the binding rejects and no default is provided', async () => {
      const { service, flags } = setup()
      flags.getStringValue.mockRejectedValueOnce(tunnelDown)
      expect(await service.getStringValue('checkout-flow')).toBe('v1')
    })

    it("returns the type's zero value when the binding rejects for an undeclared flag", async () => {
      const { service, flags } = setup()
      flags.getNumberValue.mockRejectedValueOnce(tunnelDown)
      expect(await service.getNumberValue('not-in-manifest')).toBe(0)
    })

    it('synthesizes error details when a details evaluation rejects', async () => {
      const { service, flags } = setup()
      flags.getBooleanDetails.mockRejectedValueOnce(tunnelDown)
      expect(await service.getBooleanDetails('new-checkout')).toEqual({
        flagKey: 'new-checkout',
        value: false,
        reason: 'ERROR',
        errorMessage: 'WebSocket connection failed.',
      })
    })

    it('falls back to the manifest map when the binding rejects in all()', async () => {
      const { service, flags } = setup()
      flags.getBooleanValue.mockRejectedValue(tunnelDown)
      flags.getStringValue.mockRejectedValue(tunnelDown)
      flags.getNumberValue.mockRejectedValue(tunnelDown)
      expect(await service.all()).toEqual({ 'new-checkout': false, 'checkout-flow': 'v1', 'max-uploads': 5 })
    })

    it('logs a warning per failed evaluation', async () => {
      const { service, flags, logger } = setup()
      flags.getBooleanValue.mockRejectedValueOnce(tunnelDown)
      await service.getBooleanValue('new-checkout')
      expect(logger.warn).toHaveBeenCalledTimes(1)
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('"new-checkout"'),
        { error: 'WebSocket connection failed.' },
      )
    })

    it('survives a rejecting binding without a logger', async () => {
      const flags = makeBinding()
      flags.getBooleanValue.mockRejectedValueOnce(tunnelDown)
      const service = new FeatureFlagService(makeOptions(), makeEnv(flags, makeBinding()), undefined, undefined)
      expect(await service.getBooleanValue('new-checkout')).toBe(false)
    })
  })

  describe('DI resolution', () => {
    /** Registers the service plus its dependencies in a fresh global container. */
    function container(options: Partial<FeatureFlagModuleOptions> = {}) {
      const flags = makeBinding()
      const c = new Container()
      c.registerValue(FEATURE_FLAG_TOKENS.Options, makeOptions(options))
      c.registerValue(DI_TOKENS.CloudflareEnv, makeEnv(flags, makeBinding()))
      c.register(FEATURE_FLAG_TOKENS.FeatureFlagService, FeatureFlagService)
      return { c, flags }
    }

    it('resolves from a non-request (global) container with an undefined request context', async () => {
      const resolver = vi.fn(() => ({ userId: 'u1' }))
      const { c, flags } = container({ context: resolver })
      const service = c.resolve<FeatureFlagService>(FEATURE_FLAG_TOKENS.FeatureFlagService)

      // The RouterContext token is unregistered globally; isOptional yields undefined
      // rather than throwing, so the default-context resolver is skipped.
      await service.getBooleanValue('new-checkout', false)
      expect(resolver).not.toHaveBeenCalled()
      expect(flags.getBooleanValue).toHaveBeenCalledWith('new-checkout', false, undefined)
    })

    it('resolves the default context from RouterContext inside a request scope', async () => {
      const { c, flags } = container({ context: (ctx) => ({ userId: (ctx as unknown as { userId: string }).userId }) })
      const child = new Container({ parent: c, isRequestScoped: true })
      child.registerValue(ROUTER_TOKENS.RouterContext, { userId: 'u1' } as unknown as RouterContext)

      const service = child.resolve<FeatureFlagService>(FEATURE_FLAG_TOKENS.FeatureFlagService)
      await service.getBooleanValue('new-checkout', false)
      expect(flags.getBooleanValue).toHaveBeenCalledWith('new-checkout', false, { userId: 'u1' })
    })
  })
})
