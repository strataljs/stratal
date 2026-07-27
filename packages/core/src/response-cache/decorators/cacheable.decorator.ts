import { defineMetadata, getMetadata } from '../../di/metadata'
import { ROUTE_METADATA_KEYS } from '../../router/constants'
import type { CacheableOptions } from '../types'

const KEY = ROUTE_METADATA_KEYS.CACHEABLE

/**
 * Mark a route's response as cacheable by Cloudflare Workers Caching.
 *
 * Only `GET` and `HEAD` are ever cached. Omitted fields fall back to the
 * module's `defaults` block; an explicit value always wins.
 *
 * @example
 * ```typescript
 * @Get('/blog/:slug')
 * @Cacheable({ ttl: 300, swr: 60, tags: ['post:{param.slug}'] })
 * async show(ctx: RouterContext) { ... }
 * ```
 *
 * Module defaults fill in whatever the route leaves out:
 *
 * @example
 * ```typescript
 * ResponseCacheModule.forRoot({ defaults: { ttl: 300, swr: 60 } })
 *
 * @Get('/pricing')
 * @Cacheable()                       // ttl 300, swr 60
 * async pricing(ctx: RouterContext) { ... }
 * ```
 *
 * **A guarded route needs a `partitionBy`.** A guarded route's response differs
 * per caller, so caching it under one shared entry would serve one user's
 * response to another. `@Cacheable` on a route carrying `@UseGuards` is a boot
 * error unless it declares a non-empty `partitionBy` (or inherits one from
 * `defaults.partitionBy`) — and per-caller keying additionally requires
 * `ResponseCacheModule.forRoot({ gateway: { entrypoint } })`, without which
 * `partitionBy` itself is rejected at boot.
 *
 * @example
 * ```typescript
 * @Get('/dashboard')
 * @UseGuards(AuthGuard)
 * @Cacheable({ ttl: 60, partitionBy: ['user'] })
 * async dashboard(ctx: RouterContext) { ... }
 * ```
 */
export function Cacheable(options: CacheableOptions = {}): MethodDecorator {
  return (target: object, propertyKey: string | symbol) => {
    defineMetadata(KEY, options, target, propertyKey)
  }
}

/** Read the `@Cacheable` options for a method. Returns `undefined` when absent. */
export function getCacheable(target: object, methodName: string): CacheableOptions | undefined {
  return getMetadata<CacheableOptions>(KEY, target, methodName)
}
