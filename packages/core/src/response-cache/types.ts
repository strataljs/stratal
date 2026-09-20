import type { Middleware } from '../router/middleware.interface'
import type { RouterContext } from '../router/router-context'

/** Options accepted by `@Cacheable`. Every field is optional so module defaults can supply it. */
export interface CacheableOptions {
  /** Freshness lifetime in seconds, emitted as `max-age`. */
  ttl?: number
  /**
   * How long a PRIVATE cache — a visitor's browser — may reuse the response
   * without asking, in seconds. Defaults to {@link ttl}.
   *
   * Set it to `0` for a response whose retraction has to be reliable. A purge
   * reaches the shared cache and nothing else, so for a long `ttl` a browser
   * copy outlives the response the server has already withdrawn. Pair `0` with
   * {@link swr} and the browser still paints from its copy without waiting on
   * the network, then picks the retraction up in the background.
   */
  browserTtl?: number
  /** `stale-while-revalidate` window in seconds. */
  swr?: number
  /** `Cache-Tag` values. Supports `{scope.path}` interpolation. Never defaulted at module level. */
  tags?: string[]
  /** Named partitions placed into `ctx.props`. An explicit `[]` declares the route public. */
  partitionBy?: string[]
  /** Additional `Vary` header names, unioned with module defaults. */
  vary?: string[]
}

/** Options accepted by `@PurgesCache`. */
export interface PurgesCacheOptions {
  tags?: string[]
  pathPrefixes?: string[]
  /** Exclusive — cannot be combined with `tags` or `pathPrefixes`. */
  purgeEverything?: boolean
}

/** A `@Cacheable` config after module defaults have been applied. */
export interface ResolvedCacheable {
  ttl: number
  browserTtl: number
  swr?: number
  tags: string[]
  partitionBy: string[]
  vary: string[]
}

/**
 * Resolves one named partition value for the current request.
 *
 * Runs in the gateway, after the primer chain, so `ctx.user()` and the
 * request-scoped container are available. Returning `null` or `undefined`
 * fails closed — the response is not cached.
 */
export type PartitionResolver = (
  ctx: RouterContext,
) => string | null | undefined | Promise<string | null | undefined>

/**
 * The `gateway.entrypoint` names derivable from a Worker's exports map.
 *
 * Drops `'default'`: the cached entrypoint is never the default export
 * (`cachedEntrypoint` and the boot check both reject that), so naming it is
 * always a mistake — one worth catching at compile time rather than on the
 * first request after deploy. Non-string keys are dropped too.
 *
 * Degrades to `string` when the exports map is empty. That covers both a
 * project that has not run `wrangler types` and the framework's own
 * compilation, where `Cloudflare.Exports` is `{}` — neither should be blocked,
 * and `resolveCachedEntrypoint` stays the runtime backstop for them.
 *
 * @typeParam Exports - a Worker's top-level exports, e.g. `Cloudflare.Exports`.
 */
export type EntrypointNameFrom<Exports> = [
  Exclude<Extract<keyof Exports, string>, 'default'>,
] extends [never]
  ? string
  : Exclude<Extract<keyof Exports, string>, 'default'>

/**
 * The names `gateway.entrypoint` accepts.
 *
 * In a consumer project that has run `wrangler types`, `Cloudflare.Exports` is
 * populated from `Cloudflare.GlobalProps.mainModule`, so this resolves to the
 * union of that Worker's real, non-default export names: a typo like `'Cachd'`
 * is a compile error at the config site, not a `ResponseCacheConfigError` on
 * the first request after deploy. Without generated types it is `string`.
 */
export type CachedEntrypointName = EntrypointNameFrom<Cloudflare.Exports>

/**
 * Names the cached entrypoint the gateway forwards partitioned reads to.
 *
 * The framework cannot discover the consumer's export name, so it is
 * configured. It must match a top-level export built with
 * `cachedEntrypoint(stratal)` from `stratal/workers`, and that export must be
 * declared in the Wrangler `exports` block with `cache: { enabled: true }`
 * while the default export has `cache: { enabled: false }`.
 */
export interface ResponseCacheGatewayOptions {
  /**
   * e.g. `'Cached'` for `export const Cached = cachedEntrypoint(stratal)`.
   *
   * Typed as {@link CachedEntrypointName}: when `wrangler types` has generated
   * `Cloudflare.Exports`, only this Worker's real, non-default export names are
   * accepted, so a typo is caught by the type checker. It is still validated at
   * runtime (`resolveCachedEntrypoint`) for projects without generated types.
   */
  entrypoint: CachedEntrypointName
  /**
   * Request headers whose values join the cache key, for routes that answer
   * one URL with more than one representation.
   *
   * `Vary` is the mechanism HTTP defines for this, and Workers Caching
   * documents it as honoured — but a response that varies is only *correct*
   * when the thing it varies on is in the key, and the key is the one part of
   * this that the framework controls. `ctx.props` is documented as impossible
   * to bypass; `Vary` is a request-matching pass on top of a stored entry, and
   * a URL carrying a query string has been measured serving one
   * representation to a request that asked for the other. Naming the headers
   * here makes the representation part of the key itself, so two
   * representations are two entries and no matching pass has to hold.
   *
   * For an Inertia app this is `INERTIA_VARY_HEADERS` from `@stratal/inertia`:
   * the document, the visit and each distinct partial reload are separate
   * representations of one URL.
   *
   * Anything a response declares in `Vary` that is not named here (or handled
   * by the platform itself, as `Accept-Encoding` is) makes that response
   * uncacheable rather than wrongly cacheable — see `CacheabilityService`.
   */
  keyBy?: readonly string[]
}

export interface ResponseCacheModuleOptions {
  /** Defaults applied to every `@Cacheable` route. `tags` is not defaultable. */
  defaults?: Omit<CacheableOptions, 'tags'>
  /**
   * The cached entrypoint partitioned reads are forwarded to.
   *
   * Required before any route may declare a non-empty `partitionBy`, and
   * before `partitions`/`primers` may be configured — without it there is no
   * way to place a partition in the cache key, and a route marked per-user
   * that quietly shared one cache entry would serve one visitor's page to
   * everyone.
   */
  gateway?: ResponseCacheGatewayOptions
  /**
   * Named partition resolvers, referenced by `partitionBy`.
   *
   * Resolvers run in the gateway, after the primer chain, so `ctx.user()` and
   * the request-scoped container are available. Requires `gateway`: without a
   * cached entrypoint nothing would ever call them, so configuring them alone
   * throws `ResponseCacheConfigError` at boot rather than reading as proof
   * that per-user keying is in effect.
   */
  partitions?: Record<string, PartitionResolver>
  /**
   * Middleware run in the gateway before partition resolution, so resolvers
   * see the same context the app would.
   *
   * `@stratal/framework` exports `AUTH_GATEWAY_PRIMERS` for this — pass it to
   * make `ctx.user()` resolve inside a partition resolver. Requires
   * `gateway`, for the same reason `partitions` does.
   */
  primers?: readonly (new (...args: never[]) => Middleware)[]
}
