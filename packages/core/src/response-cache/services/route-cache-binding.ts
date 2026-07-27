import { ResponseCacheConfigError } from '../errors'
import { resolveCacheable, type CacheableContext } from '../resolve-cacheable'
import type { CacheableOptions, PurgesCacheOptions, ResolvedCacheable } from '../types'

/** What one route needs at request time, resolved once at registration. */
export interface RouteCacheBinding {
  cacheable?: ResolvedCacheable
  purges?: PurgesCacheOptions
}

/** Matches a `{body.*}` cache tag placeholder (any path under the `body` scope). */
const BODY_SCOPE_TAG = /\{body\.[^}]+\}/

/**
 * Reject any tag that reads the `{body.*}` scope: the HTTP router never
 * populates `TagScopes.body` (see `RouteRegistrationService.buildTagScopes`)
 * — the parsed request body isn't cheaply available at the point tags are
 * rendered, and re-parsing it on every request just to support a rarely used
 * tag scope was deliberately rejected. A `{body.*}` tag can therefore never
 * resolve.
 *
 * Left unchecked, this doesn't fail quietly: on a `@PurgesCache` route,
 * `buildPurgeSpec(...)` is evaluated as an *argument* to `purge(...)`, so
 * `renderTags` throwing `InvalidCacheTagError` happens before `purge`'s own
 * try/catch exists — and `applyCacheDecision` has no catch of its own either,
 * so the request 500s *after* its mutation already committed. Catching it
 * here, at registration, turns a request-time failure the author only
 * discovers in production into a boot-time error they see before deploying.
 */
function assertNoBodyScopeTags(
  tags: string[] | undefined,
  decorator: '@Cacheable' | '@PurgesCache',
  context: CacheableContext,
): void {
  const offending = tags?.find((tag) => BODY_SCOPE_TAG.test(tag))
  if (!offending) return

  throw new ResponseCacheConfigError(
    `${context.controller}.${context.method}: ${decorator} tag "${offending}" uses the ` +
      '`{body.*}` scope, which can never resolve — the parsed request body is not available ' +
      'when cache tags are rendered. Use `{param.*}`, `{query.*}`, or `{data.*}` instead.',
  )
}

/** Matches a `{param.X}` cache tag placeholder, capturing the param name `X`. */
const PARAM_SCOPE_TAG = /\{param\.([^}.]+)/g

/**
 * Reject a `{param.X}` tag whose `X` is not one of this route's own path
 * parameters.
 *
 * Unlike `{query.*}`/`{data.*}` — which depend on what a given *request*
 * happens to send, and so can only fail per-request — a route's path pattern
 * is fixed the moment it is registered. Whether `{param.id}` can ever resolve
 * is therefore knowable right now: if the route's path has no `:id` segment,
 * it never will, on any request. Left unchecked, this fails the exact same
 * way as `{body.*}` — `renderTags` throws mid-`purge(...)` call, after the
 * mutation already committed. Catching it here turns that into a boot-time
 * error instead.
 *
 * No-ops when `context.routeParams` is `undefined` — the caller didn't supply
 * the route's path, so there is nothing to validate against.
 */
function assertParamTagsResolvable(
  tags: string[] | undefined,
  decorator: '@Cacheable' | '@PurgesCache',
  context: CacheableContext,
): void {
  if (!tags?.length || context.routeParams === undefined) return

  const routeParams = context.routeParams

  for (const tag of tags) {
    for (const match of tag.matchAll(PARAM_SCOPE_TAG)) {
      const param = match[1]
      if (routeParams.includes(param)) continue

      const available = routeParams.length > 0 ? routeParams.join(', ') : '(none)'

      throw new ResponseCacheConfigError(
        `${context.controller}.${context.method}: ${decorator} tag "${tag}" references ` +
          `\`{param.${param}}\`, but this route's path has no ":${param}" segment, so it can ` +
          `never resolve — available params: ${available}. Use one of those, or a ` +
          '`{query.*}`/`{data.*}` tag instead.',
      )
    }
  }
}

/**
 * Reject a `pathPrefixes` entry that looks like it expects interpolation.
 *
 * `ResponseCacheService.buildPurgeSpec` copies `pathPrefixes` through
 * verbatim — only `tags` go through `renderTags`. So
 * `pathPrefixes: ['/blog/{param.slug}']` is sent to `ctx.cache.purge()` as
 * that literal string, which matches no request path: the purge "succeeds",
 * nothing is invalidated, and the author is never told. Same class of silent
 * miss as a `{body.*}` tag, so it gets the same boot-time treatment.
 */
function assertNoTemplatedPathPrefixes(
  pathPrefixes: string[] | undefined,
  context: CacheableContext,
): void {
  const offending = pathPrefixes?.find((prefix) => prefix.includes('{') || prefix.includes('}'))
  if (offending === undefined) return

  throw new ResponseCacheConfigError(
    `${context.controller}.${context.method}: @PurgesCache \`pathPrefixes\` entry "${offending}" ` +
      'contains `{`/`}`, but path prefixes are not interpolated — only `tags` are. It would be ' +
      'purged as that literal string and match nothing. Use a static prefix (`/blog`), or move ' +
      'the dynamic part into a `{param.*}`/`{query.*}`/`{data.*}` cache tag.',
  )
}

/**
 * Fold a route's decorators and the module defaults into the config the request
 * path uses. Runs once per route at registration, never per request.
 *
 * Returns `undefined` when the route declares neither decorator, so the hot path
 * can skip all cache work with a single truthiness check.
 *
 * @throws {ResponseCacheConfigError} On a non-empty `partitionBy` when no
 *   `gateway.entrypoint` is configured. Placing a partition in the cache key
 *   requires the gateway to forward the read to a cached entrypoint over
 *   `ctx.exports`. Accepting the option and ignoring it would give every
 *   visitor a single shared entry for a route the author explicitly marked
 *   per-user.
 * @throws {ResponseCacheConfigError} On a `{body.*}` tag in either decorator's
 *   `tags` — see `assertNoBodyScopeTags`.
 * @throws {ResponseCacheConfigError} On a `{param.X}` tag whose `X` is not a
 *   `:param` in this route's own path (when `context.routeParams` is
 *   supplied) — see `assertParamTagsResolvable`.
 * @throws {ResponseCacheConfigError} On a `{`/`}` in `@PurgesCache`'s
 *   `pathPrefixes` — see `assertNoTemplatedPathPrefixes`.
 */
export function bindRouteCache(
  cacheable: CacheableOptions | undefined,
  purges: PurgesCacheOptions | undefined,
  defaults: Omit<CacheableOptions, 'tags'>,
  context: CacheableContext,
): RouteCacheBinding | undefined {
  if (!cacheable && !purges) return undefined

  assertNoBodyScopeTags(cacheable?.tags, '@Cacheable', context)
  assertNoBodyScopeTags(purges?.tags, '@PurgesCache', context)
  assertParamTagsResolvable(cacheable?.tags, '@Cacheable', context)
  assertParamTagsResolvable(purges?.tags, '@PurgesCache', context)
  assertNoTemplatedPathPrefixes(purges?.pathPrefixes, context)

  const binding: RouteCacheBinding = {}
  if (purges) binding.purges = purges

  if (cacheable) {
    const declared = cacheable.partitionBy ?? defaults.partitionBy ?? []

    if (declared.length > 0 && !context.gatewayConfigured) {
      throw new ResponseCacheConfigError(
        `${context.controller}.${context.method}: \`partitionBy\` requires a gateway entrypoint. ` +
          'Placing a partition in the cache key means forwarding the read to a cached entrypoint ' +
          'over `ctx.exports`, so the option cannot be honored without one — and a route marked ' +
          'per-caller that quietly shared a single cache entry would serve one visitor\'s ' +
          'response to everyone. Configure `ResponseCacheModule.forRoot({ gateway: { entrypoint: ' +
          '\'Cached\' }, partitions: { … } })` and `export const Cached = cachedEntrypoint(stratal)`, ' +
          'or remove `partitionBy`.',
      )
    }

    binding.cacheable = resolveCacheable(cacheable, defaults, context)
  }

  return binding
}
