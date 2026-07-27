import { Module } from '../module'
import type { AsyncModuleOptions, DynamicModule } from '../module/types'
import { assertNoGatewayOptions } from './boot-check'
import { CacheabilityService, GatewayPrimerService, GatewayRouteTable, PartitionResolverService, ResponseCacheService } from './services'
import { RESPONSE_CACHE_TOKENS } from './response-cache.tokens'
import type { ResponseCacheModuleOptions } from './types'

/**
 * Response caching on Cloudflare Workers Caching — opt-in, NOT registered
 * automatically by `Application`.
 *
 * Requires `cache.enabled = true` in the Wrangler config, Wrangler >= 4.69.0,
 * and `compatibility_date >= 2026-07-06`. Without that binding, a route
 * decorated with `@PurgesCache` throws `CachePurgeError` **at request time**
 * — after its mutation has already committed — rather than silently
 * skipping the purge and leaving the cache stale. Fail-loud is deliberate
 * here, but it does mean a `@PurgesCache` route deployed to an environment
 * that forgot `cache.enabled` turns every successful mutation into a `500`;
 * confirm the binding is present in every environment that uses it.
 *
 * `forRootAsync`'s `useFactory` **must be synchronous**, or resolve
 * synchronously from the caller's perspective: route registration reads
 * `defaults` before any async work this module kicks off could settle, so
 * an async factory's `Promise` is read as the options object itself,
 * silently discarding `defaults` (this is detected and throws at boot,
 * rather than silently caching without the intended defaults).
 *
 * Per-caller caching needs the gateway: `partitionBy`, `partitions`, and
 * `primers` all throw `ResponseCacheConfigError` at boot unless
 * `gateway: { entrypoint }` names a cached entrypoint built with
 * `cachedEntrypoint(stratal)` from `stratal/workers`. A route that declares a
 * partition it cannot honour must fail loudly rather than cache per-user data
 * publicly.
 *
 * ```typescript
 * @Module({
 *   imports: [ResponseCacheModule.forRoot({
 *     defaults: { ttl: 300, swr: 60, vary: ['Accept-Language'] },
 *   })],
 * })
 * export class AppModule {}
 * ```
 *
 * With per-caller partitioning:
 *
 * ```typescript
 * // app.module.ts
 * ResponseCacheModule.forRoot({
 *   gateway: { entrypoint: 'Cached' },
 *   partitions: { user: (ctx) => ctx.user().id },
 * })
 *
 * // src/index.ts
 * const stratal = new Stratal({ module: AppModule })
 * export default stratal
 * export const Cached = cachedEntrypoint(stratal)
 * ```
 */
@Module({
  providers: [
    { provide: RESPONSE_CACHE_TOKENS.CacheabilityService, useClass: CacheabilityService },
    { provide: RESPONSE_CACHE_TOKENS.PartitionResolverService, useClass: PartitionResolverService },
    { provide: RESPONSE_CACHE_TOKENS.GatewayPrimerService, useClass: GatewayPrimerService },
    { provide: RESPONSE_CACHE_TOKENS.ResponseCacheService, useClass: ResponseCacheService },
    { provide: RESPONSE_CACHE_TOKENS.GatewayRouteTable, useClass: GatewayRouteTable },
  ],
})
export class ResponseCacheModule {
  static forRoot(options: ResponseCacheModuleOptions = {}): DynamicModule {
    assertNoGatewayOptions(options)

    return {
      module: ResponseCacheModule,
      providers: [{ provide: RESPONSE_CACHE_TOKENS.Options, useValue: options }],
    }
  }

  static forRootAsync(options: AsyncModuleOptions<ResponseCacheModuleOptions>): DynamicModule {
    return {
      module: ResponseCacheModule,
      providers: [
        {
          provide: RESPONSE_CACHE_TOKENS.Options,
          // Same rejection as `forRoot`, applied to whatever the factory
          // produced. A `Promise` is passed through untouched: an async
          // factory is its own boot error, raised in
          // `RouteRegistrationService.responseCacheDefaults()` with a message
          // about the real problem — inspecting a Promise for `partitions`
          // here would only report a missing option instead.
          useFactory: (...deps: unknown[]) => {
            const resolved = options.useFactory(...deps)
            if (!(resolved instanceof Promise)) assertNoGatewayOptions(resolved)
            return resolved
          },
          inject: options.inject ?? [],
        },
      ],
    }
  }
}
