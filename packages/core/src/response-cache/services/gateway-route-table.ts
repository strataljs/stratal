import { Singleton } from '../../di/decorators'
import { RESPONSE_CACHE_TOKENS } from '../response-cache.tokens'
import type { CacheableOptions } from '../types'

/**
 * What the dispatch middleware needs to know about one route.
 *
 * Typed as a `CacheableOptions` (every field optional) rather than a bespoke
 * shape so it can be handed straight to `shouldLoopback`, which already
 * encodes "only GET/HEAD ever loop back".
 */
export interface GatewayRouteEntry extends CacheableOptions {
  partitionBy: string[]
}

/**
 * `${METHOD} ${routePath}` → the partitions that route declared.
 *
 * Populated once, at route registration, and only for routes whose
 * **effective** `partitionBy` (after module defaults) is non-empty. Every
 * other route is absent, and absence means "run inline" — the safe default,
 * and the one that keeps an app which uses no partitions paying nothing but a
 * single `isEmpty` check per request.
 *
 * The key is the route *pattern* Hono matched (`/posts/:id`), not the request
 * path, so one entry serves every request to that route.
 */
@Singleton(RESPONSE_CACHE_TOKENS.GatewayRouteTable)
export class GatewayRouteTable {
  private readonly entries = new Map<string, GatewayRouteEntry>()

  /**
   * The consumer's `export const <name> = cachedEntrypoint(stratal)`, from
   * `ResponseCacheModule.forRoot({ gateway: { entrypoint } })`.
   *
   * `undefined` means no gateway is configured, which is also the condition
   * under which `bindRouteCache` refuses a non-empty `partitionBy` — so an
   * unconfigured table is always an empty one.
   */
  entrypoint: string | undefined

  /** Set by `RouteRegistrationService.configure()`, before any request. */
  configure(entrypoint: string | undefined): void {
    this.entrypoint = entrypoint
  }

  /** True when no route in this app declares a partition. */
  get isEmpty(): boolean {
    return this.entries.size === 0
  }

  /** Number of recorded routes. Test/diagnostic affordance. */
  get size(): number {
    return this.entries.size
  }

  /**
   * Record one registered route.
   *
   * `method` is the Hono-registered method; `path` is the pattern the route
   * was registered under (already expanded for versioning and locale
   * variants, so each variant gets its own entry).
   */
  record(method: string, path: string, partitionBy: string[]): void {
    if (partitionBy.length === 0) return
    this.entries.set(`${method.toUpperCase()} ${path}`, { partitionBy })
  }

  /** The entry for a matched route pattern, or `undefined` to run inline. */
  lookup(method: string, path: string): GatewayRouteEntry | undefined {
    return this.entries.get(`${method.toUpperCase()} ${path}`)
  }
}
