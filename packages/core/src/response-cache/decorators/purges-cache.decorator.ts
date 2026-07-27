import { defineMetadata, getMetadata } from '../../di/metadata'
import { ROUTE_METADATA_KEYS } from '../../router/constants'
import { ResponseCacheConfigError } from '../errors'
import type { PurgesCacheOptions } from '../types'

const KEY = ROUTE_METADATA_KEYS.PURGES_CACHE

/**
 * Invalidate cached responses after this route mutates data.
 *
 * Runs after the handler returns a 2xx or 3xx. `pathPrefixes` matches the
 * request path only, so `['/blog']` also clears `/blog?page=2`.
 *
 * @example
 * ```typescript
 * @Post('/posts/:slug/publish')
 * @PurgesCache({ tags: ['post:{param.slug}', 'category:{data.post.categoryId}'] })
 * async publish(ctx: RouterContext) { ... }
 * ```
 */
export function PurgesCache(options: PurgesCacheOptions): MethodDecorator {
  const hasTargets = (options.tags?.length ?? 0) > 0 || (options.pathPrefixes?.length ?? 0) > 0

  if (options.purgeEverything && hasTargets) {
    throw new ResponseCacheConfigError(
      '@PurgesCache: `purgeEverything` is exclusive — remove `tags` and `pathPrefixes`.',
    )
  }

  if (!options.purgeEverything && !hasTargets) {
    throw new ResponseCacheConfigError(
      '@PurgesCache: specify at least one of `tags`, `pathPrefixes`, or `purgeEverything`.',
    )
  }

  return (target: object, propertyKey: string | symbol) => {
    defineMetadata(KEY, options, target, propertyKey)
  }
}

/** Read the `@PurgesCache` options for a method. Returns `undefined` when absent. */
export function getPurgesCache(target: object, methodName: string): PurgesCacheOptions | undefined {
  return getMetadata<PurgesCacheOptions>(KEY, target, methodName)
}
