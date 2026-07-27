import { describe, expect, it } from 'vitest'
import type { Middleware, Next } from '../../router/middleware.interface'
import type { RouterContext } from '../../router/router-context'
import { ResponseCacheConfigError } from '../errors'
import { ResponseCacheModule } from '../response-cache.module'
import { RESPONSE_CACHE_TOKENS } from '../response-cache.tokens'
import type { DynamicModule, FactoryProvider } from '../../module/types'
import type { ResponseCacheModuleOptions } from '../types'

class NoopPrimer implements Middleware {
  async handle(_ctx: RouterContext, next: Next): Promise<void> {
    await next()
  }
}

/** Pull the `Options` factory back out of the dynamic module so it can be run. */
function optionsFactory(module: DynamicModule): () => unknown {
  const provider = (module.providers ?? []).find(
    (p): p is FactoryProvider<ResponseCacheModuleOptions & object> =>
      typeof p === 'object' && 'provide' in p && p.provide === RESPONSE_CACHE_TOKENS.Options,
  )
  if (!provider || !('useFactory' in provider)) throw new Error('no Options factory provider')
  return provider.useFactory
}

describe('ResponseCacheModule', () => {
  describe('forRoot', () => {
    it('accepts options that only set `defaults`', () => {
      expect(() => ResponseCacheModule.forRoot({ defaults: { ttl: 300, swr: 60 } })).not.toThrow()
    })

    it('accepts being called with no options at all', () => {
      expect(() => ResponseCacheModule.forRoot()).not.toThrow()
    })

    it('throws on `partitions` when no gateway entrypoint is configured', () => {
      // `partitionBy` — the only thing that would name a partition — is
      // itself a boot error without a gateway, so a configured resolver is
      // dead weight the author would reasonably read as proof of per-user
      // keying.
      expect(() =>
        ResponseCacheModule.forRoot({ partitions: { user: () => 'u1' } }),
      ).toThrow(ResponseCacheConfigError)
      expect(() =>
        ResponseCacheModule.forRoot({ partitions: { user: () => 'u1' } }),
      ).toThrow(/requires `gateway: \{ entrypoint \}`/)
    })

    it('throws on `primers` when no gateway entrypoint is configured', () => {
      expect(() => ResponseCacheModule.forRoot({ primers: [NoopPrimer] })).toThrow(
        ResponseCacheConfigError,
      )
      expect(() => ResponseCacheModule.forRoot({ primers: [NoopPrimer] })).toThrow(
        /requires `gateway: \{ entrypoint \}`/,
      )
    })

    it('accepts `partitions` and `primers` once a gateway entrypoint is configured', () => {
      expect(() =>
        ResponseCacheModule.forRoot({
          gateway: { entrypoint: 'Cached' },
          partitions: { user: () => 'u1' },
          primers: [NoopPrimer],
        }),
      ).not.toThrow()
    })
  })

  describe('forRootAsync', () => {
    it('accepts a synchronous factory returning only `defaults`', () => {
      const factory = optionsFactory(
        ResponseCacheModule.forRootAsync({ useFactory: () => ({ defaults: { ttl: 300 } }) }),
      )
      expect(factory()).toEqual({ defaults: { ttl: 300 } })
    })

    it('throws when the factory returns `partitions`', () => {
      const factory = optionsFactory(
        ResponseCacheModule.forRootAsync({
          useFactory: () => ({ partitions: { user: () => 'u1' } }),
        }),
      )
      expect(() => factory()).toThrow(ResponseCacheConfigError)
      expect(() => factory()).toThrow(/`partitions` requires `gateway: \{ entrypoint \}`/)
    })

    it('throws when the factory returns `primers`', () => {
      const factory = optionsFactory(
        ResponseCacheModule.forRootAsync({ useFactory: () => ({ primers: [NoopPrimer] }) }),
      )
      expect(() => factory()).toThrow(ResponseCacheConfigError)
      expect(() => factory()).toThrow(/`primers` requires `gateway: \{ entrypoint \}`/)
    })

    it('passes a Promise straight through — the async factory is its own boot error', () => {
      // Inspecting a Promise for `partitions` would report a missing option
      // instead of the real problem, which `RouteRegistrationService` reports
      // with a message about `forRootAsync` never being awaited.
      const factory = optionsFactory(
        ResponseCacheModule.forRootAsync({
          useFactory: () => Promise.resolve({ partitions: { user: () => 'u1' } }),
        }),
      )
      expect(factory()).toBeInstanceOf(Promise)
    })
  })
})
