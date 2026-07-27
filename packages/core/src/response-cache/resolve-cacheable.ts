import { ResponseCacheConfigError } from './errors'
import type { CacheableOptions, ResolvedCacheable } from './types'

/** Where a `@Cacheable` was declared, for error messages and the guard rule. */
export interface CacheableContext {
  controller: string
  method: string
  /** True when the route or its controller has guards attached. */
  guarded: boolean
  /**
   * The `:param` names this route's own path declares, in order — used to
   * validate `{param.*}` cache tags against a route that can never populate
   * them. `undefined` (rather than `[]`) means "not known to the caller",
   * which skips that validation entirely instead of treating every
   * `{param.*}` tag as unresolvable; only the real HTTP registration path
   * (`RouteRegistrationService`) can supply it, so unit tests exercising
   * `bindRouteCache` directly are free to omit it.
   */
  routeParams?: string[]
  /**
   * True when `ResponseCacheModule.forRoot({ gateway: { entrypoint } })` names
   * a cached entrypoint — the only configuration under which a partition can
   * actually be placed in the cache key. Governs both the `partitionBy` throw
   * in `bindRouteCache` and the guarded-route message below.
   */
  gatewayConfigured?: boolean
}

/**
 * Fold module defaults into a route's `@Cacheable` options.
 *
 * `partitionBy` replaces rather than merges: a route must be able to declare
 * itself public (`[]`) or re-partition without inheriting a stale default.
 * Reading the route alone must be enough to know how it is keyed.
 */
export function resolveCacheable(
  route: CacheableOptions,
  defaults: Omit<CacheableOptions, 'tags'>,
  context: CacheableContext,
): ResolvedCacheable {
  const where = `${context.controller}.${context.method}`
  const ttl = route.ttl ?? defaults.ttl

  if (ttl === undefined) {
    throw new ResponseCacheConfigError(
      `${where}: @Cacheable needs a \`ttl\`, either on the route or via ResponseCacheModule.forRoot({ defaults: { ttl } }).`,
    )
  }

  if (ttl <= 0 || !Number.isFinite(ttl)) {
    throw new ResponseCacheConfigError(`${where}: @Cacheable \`ttl\` must be a positive number of seconds.`)
  }

  const swr = route.swr ?? defaults.swr

  // Unlike `ttl`, `0` is meaningful here — it means no stale window — so only
  // negative or non-finite values are rejected. Left unchecked, a negative,
  // `NaN`, or `Infinity` value emits a malformed `stale-while-revalidate`
  // directive; per RFC 9111 / RFC 5861 `delta-seconds`, Cloudflare silently
  // ignores it, disabling stale-while-revalidate with no error anywhere.
  if (swr !== undefined && (swr < 0 || !Number.isFinite(swr))) {
    throw new ResponseCacheConfigError(`${where}: @Cacheable \`swr\` must be a non-negative finite number of seconds.`)
  }

  const partitionBy = route.partitionBy ?? defaults.partitionBy ?? []

  // A guard means the response varies by caller, so it must be partitioned.
  // `partitionBy: []` on a guarded route is rejected rather than honoured:
  // declaring a guarded route public is exactly the mistake this rule exists
  // to catch. The advice differs by configuration — telling an app with no
  // gateway to "declare a partitionBy" would be a dead end, since
  // `bindRouteCache` rejects that too.
  if (context.guarded && partitionBy.length === 0) {
    throw new ResponseCacheConfigError(
      context.gatewayConfigured
        ? `${where}: @Cacheable on a guarded route needs a non-empty \`partitionBy\`. A guarded ` +
            'route\'s response differs per caller, so caching it under one shared entry would ' +
            'serve one user\'s response to another. Declare the partitions it varies by ' +
            '(`@Cacheable({ partitionBy: [\'user\'] })`), or set a module-level ' +
            '`defaults.partitionBy`. `partitionBy: []` is not accepted here even explicitly.'
        : `${where}: @Cacheable cannot be used on a guarded route without a gateway entrypoint. ` +
            'A guarded route\'s response differs per caller, so caching it would serve one ' +
            'user\'s response to another. Per-caller cache keying needs ' +
            '`ResponseCacheModule.forRoot({ gateway: { entrypoint } })` plus a `partitionBy` — ' +
            'configure both, or remove @Cacheable from this route.',
    )
  }

  return {
    ttl,
    swr,
    tags: route.tags ?? [],
    partitionBy,
    vary: [...new Set([...(defaults.vary ?? []), ...(route.vary ?? [])])],
  }
}
