import { inject } from '../../di'
import { CACHE_TOKENS } from '../../cache/cache.tokens'
import type { CacheService } from '../../cache/services/cache.service'
import { CONTAINER_TOKEN, type Container } from '../../di'
import { Singleton } from '../../di/decorators'
import { DI_TOKENS } from '../../di/tokens'
import type { StratalEnv } from '../../env'
import type { Constructor } from '../../types'
import { RateLimiterError } from '../errors'
import { RATE_LIMITER_TOKENS } from '../rate-limiter.tokens'
import { KvRateLimiterStore } from './kv-store'
import { InMemoryRateLimiterStore } from './memory-store'
import type { IRateLimiterStore } from './rate-limiter-store.interface'

/**
 * Configuration for `RateLimiterModule.forRoot()`. Picks the backing store.
 *
 * - `'kv'`: Cloudflare KV. `binding` names the KVNamespace on `StratalEnv`.
 * - `'memory'`: in-process Map. Tests / single-isolate only.
 * - `{ useClass }`: any class implementing `IRateLimiterStore`. Resolved
 *   from the DI container (so the class can declare its own `@inject` deps,
 *   e.g. a Durable Object namespace from `StratalEnv`).
 */
export type RateLimiterModuleOptions =
  | { store: 'kv'; binding: keyof StratalEnv }
  | { store: 'memory' }
  | { store: { useClass: Constructor<IRateLimiterStore> } }

// IMPORTANT: see RateLimiterRegistry — no token on @Singleton so the
// factory isn't globally bound at class-load time. Module providers are
// the sole binding source, which keeps the "module not imported" detection
// in ThrottleMiddleware working.
@Singleton()
export class RateLimiterStoreFactory {
  constructor(
    @inject(DI_TOKENS.CloudflareEnv) private readonly env: StratalEnv,
    @inject(CACHE_TOKENS.CacheService) private readonly cache: CacheService,
    @inject(CONTAINER_TOKEN) private readonly container: Container,
    @inject(RATE_LIMITER_TOKENS.Options, { isOptional: true })
    private readonly options?: RateLimiterModuleOptions,
  ) {}

  create(): IRateLimiterStore {
    if (!this.options) {
      throw new RateLimiterError('RateLimiterModule is not configured. Call RateLimiterModule.forRoot({ store: ... }) to configure a backing store.')
    }

    const { store } = this.options

    if (store === 'memory') {
      return new InMemoryRateLimiterStore()
    }

    if (store === 'kv') {
      const binding = this.env[this.options.binding] as KVNamespace | undefined
      if (!binding) {
        throw new RateLimiterError(`KV binding "${String(this.options.binding)}" is not available in the environment.`)
      }
      return new KvRateLimiterStore(this.cache.withBinding(binding))
    }

    return this.container.resolve<IRateLimiterStore>(store.useClass)
  }
}
