import type { BetterAuthOptions } from 'better-auth'
import { Container, CONTAINER_TOKEN } from 'stratal/di'
import type { IRateLimiterStore } from 'stratal/rate-limiter'
import { Limit, RATE_LIMITER_TOKENS, RateLimiterRegistry } from 'stratal/rate-limiter'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthModule } from '../auth.module'
import { AUTH_OPTIONS } from '../auth.tokens'

class FakeStore implements IRateLimiterStore {
  private readonly entries = new Map<string, unknown>()
  get<T>(key: string): Promise<T | null> {
    return Promise.resolve((this.entries.get(key) as T | undefined) ?? null)
  }
  set<T>(key: string, value: T, _ttlSeconds: number): Promise<void> {
    this.entries.set(key, value)
    return Promise.resolve()
  }
  delete(key: string): Promise<void> {
    this.entries.delete(key)
    return Promise.resolve()
  }
}

interface FactoryShape {
  provide: symbol
  useFactory: (...deps: unknown[]) => unknown
  inject: unknown[]
}

function findAuthOptionsProvider(forRootResult: ReturnType<typeof AuthModule.forRootAsync>): FactoryShape {
  const provider = forRootResult.providers?.find(
    (p) => 'provide' in p && p.provide === AUTH_OPTIONS,
  )
  if (!provider) throw new Error('AUTH_OPTIONS provider not found on forRootAsync result')
  return provider as unknown as FactoryShape
}

describe('AuthModule.forRootAsync — rate-limit auto-wiring', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('returns the user options unchanged when RateLimiterModule is NOT imported', () => {
    const userOptions: BetterAuthOptions = {
      secret: 'x',
      baseURL: 'http://localhost',
    }
    const dynamic = AuthModule.forRootAsync({
      useFactory: () => userOptions,
    })

    const provider = findAuthOptionsProvider(dynamic)
    const merged = provider.useFactory(container) as BetterAuthOptions

    expect(merged).toEqual(userOptions)
    expect(merged.rateLimit).toBeUndefined()
  })

  it('attaches customStorage and customRules when RateLimiterModule marker is present', () => {
    const store = new FakeStore()
    const registry = new RateLimiterRegistry(container)
    registry.forPath('/sign-in/email', () => Limit.perSeconds(10, 3))

    container.registerValue(RATE_LIMITER_TOKENS.ModuleMarker, { imported: true })
    container.registerValue(RATE_LIMITER_TOKENS.Store, store)
    container.registerValue(RATE_LIMITER_TOKENS.Registry, registry)

    const dynamic = AuthModule.forRootAsync({
      useFactory: () => ({ secret: 'x', baseURL: 'http://localhost' }),
    })

    const provider = findAuthOptionsProvider(dynamic)
    expect(provider.inject).toEqual([CONTAINER_TOKEN])

    const merged = provider.useFactory(container) as BetterAuthOptions

    expect(merged.rateLimit?.enabled).toBe(true)
    expect(typeof merged.rateLimit?.customStorage?.get).toBe('function')
    expect(typeof merged.rateLimit?.customStorage?.set).toBe('function')
    expect(merged.rateLimit?.customRules).toHaveProperty('/sign-in/email')
    expect(typeof merged.rateLimit?.customRules?.['/sign-in/email']).toBe('function')
  })

  it('respects user-supplied customStorage (does not overwrite)', () => {
    const userStorage = { get: vi.fn(), set: vi.fn() }
    const store = new FakeStore()
    const registry = new RateLimiterRegistry(container)

    container.registerValue(RATE_LIMITER_TOKENS.ModuleMarker, { imported: true })
    container.registerValue(RATE_LIMITER_TOKENS.Store, store)
    container.registerValue(RATE_LIMITER_TOKENS.Registry, registry)

    const dynamic = AuthModule.forRootAsync({
      useFactory: () => ({
        secret: 'x',
        baseURL: 'http://localhost',
        rateLimit: { customStorage: userStorage },
      }),
    })

    const merged = findAuthOptionsProvider(dynamic).useFactory(container) as BetterAuthOptions
    expect(merged.rateLimit?.customStorage).toBe(userStorage)
  })

  it('lets user-supplied customRules entries override projected entries on collision', () => {
    const store = new FakeStore()
    const registry = new RateLimiterRegistry(container)
    registry.forPath('/sign-in/email', () => Limit.perSeconds(10, 3))

    container.registerValue(RATE_LIMITER_TOKENS.ModuleMarker, { imported: true })
    container.registerValue(RATE_LIMITER_TOKENS.Store, store)
    container.registerValue(RATE_LIMITER_TOKENS.Registry, registry)

    const userOverride = { window: 5, max: 1 }
    const dynamic = AuthModule.forRootAsync({
      useFactory: () => ({
        secret: 'x',
        baseURL: 'http://localhost',
        rateLimit: {
          customRules: {
            '/sign-in/email': userOverride,
            '/forgot-password': { window: 60, max: 1 },
          },
        },
      }),
    })

    const merged = findAuthOptionsProvider(dynamic).useFactory(container) as BetterAuthOptions
    const rules = merged.rateLimit?.customRules
    expect(rules?.['/sign-in/email']).toBe(userOverride)
    expect(rules?.['/forgot-password']).toEqual({ window: 60, max: 1 })
  })

  it('forwards user inject tokens after CONTAINER_TOKEN', () => {
    const userToken = Symbol.for('test:user-token')
    container.registerValue(userToken, { value: 'from-di' })

    const factory = vi.fn((dep: { value: string }) => ({
      secret: 'x',
      baseURL: 'http://localhost',
      meta: dep.value,
    }))

    const dynamic = AuthModule.forRootAsync({
      inject: [userToken],
      useFactory: factory,
    })

    const provider = findAuthOptionsProvider(dynamic)
    expect(provider.inject).toEqual([CONTAINER_TOKEN, userToken])

    const dep = { value: 'from-di' }
    provider.useFactory(container, dep)
    expect(factory).toHaveBeenCalledWith(dep)
  })
})
