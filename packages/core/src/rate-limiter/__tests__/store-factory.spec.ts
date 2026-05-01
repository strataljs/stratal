import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import { describe, expect, it } from 'vitest'
import type { CacheService } from '../../cache/services/cache.service'
import type { Container } from '../../di/container'
import type { StratalEnv } from '../../env'
import { RateLimiterNotConfiguredError } from '../errors'
import { InMemoryRateLimiterStore } from '../stores/memory-store'
import { KvRateLimiterStore } from '../stores/kv-store'
import {
  RateLimiterStoreFactory,
  type RateLimiterModuleOptions,
} from '../stores/store-factory'
import type { IRateLimiterStore } from '../stores/rate-limiter-store.interface'

function buildFactory(options?: RateLimiterModuleOptions, env?: Partial<StratalEnv>): {
  factory: RateLimiterStoreFactory
  container: DeepMocked<Container>
  cache: DeepMocked<CacheService>
} {
  const cache = createMock<CacheService>()
  const container = createMock<Container>()
  const fullEnv = { ENVIRONMENT: 'test', CACHE: createMock<KVNamespace>(), ...(env ?? {}) } as unknown as StratalEnv
  const factory = new RateLimiterStoreFactory(
    fullEnv,
    cache as unknown as CacheService,
    container as unknown as Container,
    options,
  )
  return { factory, container, cache }
}

describe('RateLimiterStoreFactory', () => {
  it('throws RateLimiterNotConfiguredError when no options are bound', () => {
    const { factory } = buildFactory(undefined)
    expect(() => factory.create()).toThrow(RateLimiterNotConfiguredError)
  })

  it("returns InMemoryRateLimiterStore for { store: 'memory' }", () => {
    const { factory } = buildFactory({ store: 'memory' })
    expect(factory.create()).toBeInstanceOf(InMemoryRateLimiterStore)
  })

  it("returns KvRateLimiterStore bound to env[binding] for { store: 'kv' }", () => {
    const customKv = createMock<KVNamespace>()
    const { factory, cache } = buildFactory(
      { store: 'kv', binding: 'CUSTOM_KV' as keyof StratalEnv },
      { CUSTOM_KV: customKv } as unknown as Partial<StratalEnv>,
    )

    const store = factory.create()

    expect(store).toBeInstanceOf(KvRateLimiterStore)
    expect(cache.withBinding).toHaveBeenCalledWith(customKv)
  })

  it('throws when the named KV binding is missing from env', () => {
    const { factory } = buildFactory(
      { store: 'kv', binding: 'MISSING_KV' as keyof StratalEnv },
      {},
    )
    expect(() => factory.create()).toThrow(RateLimiterNotConfiguredError)
  })

  it('resolves a custom store class from the container for { store: { useClass } }', () => {
    class CustomStore implements IRateLimiterStore {
      hit() { return Promise.resolve({ count: 1, resetAt: 0 }) }
      reset() { return Promise.resolve() }
    }
    const customInstance = new CustomStore()
    const { factory, container } = buildFactory({ store: { useClass: CustomStore } })
    container.resolve.mockReturnValue(customInstance)

    expect(factory.create()).toBe(customInstance)
    expect(container.resolve).toHaveBeenCalledWith(CustomStore)
  })
})
