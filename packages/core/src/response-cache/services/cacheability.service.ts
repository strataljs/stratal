import { inject } from '../../di'
import { Singleton } from '../../di/decorators'
import { LOGGER_TOKENS, type LoggerService } from '../../logger'
import { unkeyedVary } from '../representation'
import { RESPONSE_CACHE_TOKENS } from '../response-cache.tokens'
import { setResponseHeaders } from '../response-headers'
import { renderTags, type TagScopes } from '../tag-template'
import type { ResolvedCacheable, ResponseCacheModuleOptions } from '../types'

/** Inertia-specific conditions that make a page unsafe to cache. */
export interface InertiaCacheSignals {
  hasFlash: boolean
  isPartial: boolean
  hasOnceProps: boolean
  /**
   * Request headers the adapter reports this response is a function of.
   * Unioned into `Vary`, so a partial reload and the full page at the same URL
   * are stored as separate variants rather than colliding.
   *
   * Required rather than optional: an empty list is what makes a partial reload
   * fail closed, and an adapter that simply forgot the field would otherwise be
   * indistinguishable from one declaring the response unkeyed.
   */
  varyHeaders: readonly string[]
}

export interface CacheabilitySignals {
  /** False when any declared partition resolver returned null/undefined. */
  partitionsResolved: boolean
  inertia?: InertiaCacheSignals
}

/** What fail-closed emits. Cloudflare treats this as BYPASS. */
const NO_STORE = 'private, no-store'


/**
 * Decides whether a `@Cacheable` response may actually be cached, and stamps
 * the headers that say so.
 *
 * Everything that is not provably safe becomes `private, no-store`. That
 * matters more than it looks: Workers Caching applies RFC 9111 heuristic
 * freshness, so a response with no `Cache-Control` at all is still cached —
 * `200` for two hours. Silence is not a safe default here.
 */
@Singleton(RESPONSE_CACHE_TOKENS.CacheabilityService)
export class CacheabilityService {
  constructor(
    @inject(LOGGER_TOKENS.LoggerService) private readonly logger: LoggerService,
    @inject(RESPONSE_CACHE_TOKENS.Options) private readonly options: ResponseCacheModuleOptions,
  ) {}

  apply(response: Response, resolved: ResolvedCacheable, scopes: TagScopes, signals: CacheabilitySignals): Response {
    // Computed before the decision, because what a response varies on is one of
    // the things that decides it.
    const vary = this.mergeVary(response, [...resolved.vary, ...(signals.inertia?.varyHeaders ?? [])])

    const reason = this.rejectionReason(response, signals, vary)

    if (reason) {
      this.logger.warn('[stratal:response-cache] Response not cached', { reason })
      return this.withHeaders(response, { 'Cache-Control': NO_STORE })
    }

    // Two audiences, two headers. `CDN-Cache-Control` is the one Cloudflare
    // reads in preference to `Cache-Control`, and the one browsers ignore
    // entirely, so the lifetime lands where it can still be purged and nowhere
    // else. Keeping them separate is also what lets `swr` survive: expressing
    // the same split through `s-maxage` would end the stale window, since
    // Cloudflare stops honouring `stale-while-revalidate` once it is present.
    const headers: Record<string, string> = {
      'Cache-Control': this.browserCacheControl(resolved),
      'CDN-Cache-Control': this.sharedCacheControl(resolved),
    }

    // Malformed tag templates (e.g., missing scope value) throw InvalidCacheTagError.
    // Rather than crashing the request, fail closed — a bad tag is an author bug
    // distinct from ordinary rejections (which are runtime data), and the risk
    // the throw guarded against was a tag silently vanishing while the response
    // cached anyway. Here, the response doesn't cache at all.
    let tags: string[]
    try {
      tags = renderTags(resolved.tags, scopes)
    } catch (error) {
      this.logger.error('[stratal:response-cache] Invalid cache tag; not caching', { error })
      return this.withHeaders(response, { 'Cache-Control': NO_STORE })
    }

    if (tags.length > 0) headers['Cache-Tag'] = tags.join(',')

    if (vary) headers.Vary = vary

    return this.withHeaders(response, headers)
  }

  /** The first condition that makes this response unsafe to cache, if any. */
  private rejectionReason(response: Response, signals: CacheabilitySignals, vary: string | null): string | null {
    if (response.headers.has('Set-Cookie')) return 'set-cookie'
    if (response.status < 200 || response.status > 299) return 'status'
    if (!signals.partitionsResolved) return 'partition-unresolved'

    const inertia = signals.inertia
    if (inertia?.hasFlash) return 'inertia-flash'
    if (inertia?.hasOnceProps) return 'inertia-once'

    // A partial reload IS cacheable — it is a deterministic function of the URL,
    // the partition, and the headers naming which props were asked for. What is
    // not cacheable is one whose adapter did not report those headers: keying it
    // on the URL alone would make it interchangeable with the full page and with
    // every other prop set at that URL.
    if (inertia?.isPartial && inertia.varyHeaders.length === 0) return 'inertia-partial-unkeyed'

    // Anything this response varies on that is not also in the cache key is a
    // way for two different bodies to share one entry. `Vary` is supposed to
    // prevent that on its own; measured against Workers Caching on a URL with a
    // query string, it does not — a variant stored for one header value is
    // handed to a request sending another. So the key has to carry it, and a
    // response naming a header the key does not is refused rather than stored
    // wrong. `gateway.keyBy` is what puts a header into the key.
    //
    // Only under a gateway, and that boundary is evidence, not caution: the
    // failure was measured on the loopback topology, and the loopback is also
    // the only place a representation CAN reach the key, since `ctx.props` is
    // set by the forwarding call. Refusing without a gateway would withdraw
    // caching from apps on a path whose behaviour has not been measured, and
    // offer them nothing to fix it with.
    const gateway = this.options.gateway
    const unkeyed = gateway ? unkeyedVary(vary, gateway.keyBy) : []
    if (unkeyed.length > 0) {
      this.logger.warn(
        `[stratal:response-cache] Response varies on ${unkeyed.join(', ')}, which is not in the ` +
          'cache key, so it is not cached. Add those names to ' +
          'ResponseCacheModule.forRoot({ gateway: { keyBy: [...] } }) — for an Inertia app, ' +
          '`INERTIA_VARY_HEADERS` from @stratal/inertia.',
        { vary: unkeyed },
      )
      return 'vary-unkeyed'
    }

    return null
  }

  /**
   * What a PRIVATE cache — a visitor's browser — may do with the response.
   *
   * A browser copy is the one this feature cannot reach: `Cache-Tag` and
   * `ctx.cache.purge()` retire the shared copy, and nothing retires that one.
   * So `browserTtl` is what a route says it is willing to have held without
   * being askable, and it defaults to `ttl` — the same lifetime the shared
   * cache was already given.
   *
   * `stale-while-revalidate` is emitted here as well as on the shared header,
   * and it is what makes a short `browserTtl` cheap rather than punishing: the
   * browser paints from the copy it has instead of waiting on the network, and
   * fetches the replacement behind that. A route that must be retractable sets
   * `browserTtl: 0` with a stale window, and converges on the next navigation
   * rather than holding a withdrawn response for the whole `ttl`.
   *
   * `must-revalidate` only where there is no stale window to protect: it
   * forbids serving stale at all, which is the opposite of what `swr` asks
   * for, so emitting both would leave the pair contradicting each other.
   */
  private browserCacheControl(resolved: ResolvedCacheable): string {
    const parts = ['public', `max-age=${resolved.browserTtl}`]

    if (resolved.swr !== undefined) parts.push(`stale-while-revalidate=${resolved.swr}`)
    else if (resolved.browserTtl === 0) parts.push('must-revalidate')

    return parts.join(', ')
  }

  /** The lifetime, for the cache that can be purged. */
  private sharedCacheControl(resolved: ResolvedCacheable): string {
    const parts = ['public', `max-age=${resolved.ttl}`]
    if (resolved.swr !== undefined) parts.push(`stale-while-revalidate=${resolved.swr}`)
    return parts.join(', ')
  }

  /** Union the declared Vary names with whatever the response already set. */
  private mergeVary(response: Response, declared: string[]): string | null {
    const existing = (response.headers.get('Vary') ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)

    const merged = [...new Set([...existing, ...declared])]
    return merged.length > 0 ? merged.join(', ') : null
  }

  /**
   * Overlay headers onto the response, mutating in place when the header
   * list is writable — see `setResponseHeaders` for why that's the common
   * case and safe. `Cache-Tag` and `CDN-Cache-Control` are explicitly deleted
   * (not just omitted) when degrading to `no-store`, so neither a stale tag
   * nor a lifetime from a differently-decided response lingers. The second
   * matters most: Cloudflare reads `CDN-Cache-Control` in preference to
   * `Cache-Control`, so one left behind would cache a response this just
   * refused to cache.
   */
  private withHeaders(response: Response, headers: Record<string, string>): Response {
    const toSet: Record<string, string | null> = { ...headers }
    if (headers['Cache-Control'] === NO_STORE) {
      toSet['Cache-Tag'] = null
      toSet['CDN-Cache-Control'] = null
    }

    return setResponseHeaders(response, toSet)
  }
}
