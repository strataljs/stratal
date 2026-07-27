import { inject } from '../../di'
import { Singleton } from '../../di/decorators'
import { LOGGER_TOKENS, type LoggerService } from '../../logger'
import { RESPONSE_CACHE_TOKENS } from '../response-cache.tokens'
import { setResponseHeaders } from '../response-headers'
import { renderTags, type TagScopes } from '../tag-template'
import type { ResolvedCacheable } from '../types'

/** Inertia-specific conditions that make a page unsafe to cache. */
export interface InertiaCacheSignals {
  hasFlash: boolean
  isPartial: boolean
  hasOnceProps: boolean
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
  ) {}

  apply(
    response: Response,
    resolved: ResolvedCacheable,
    scopes: TagScopes,
    signals: CacheabilitySignals,
  ): Response {
    const reason = this.rejectionReason(response, signals)

    if (reason) {
      this.logger.warn('[stratal:response-cache] Response not cached', { reason })
      return this.withHeaders(response, { 'Cache-Control': NO_STORE })
    }

    const headers: Record<string, string> = {
      'Cache-Control': this.cacheControl(resolved),
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

    const vary = this.mergeVary(response, resolved.vary)
    if (vary) headers.Vary = vary

    return this.withHeaders(response, headers)
  }

  /** The first condition that makes this response unsafe to cache, if any. */
  private rejectionReason(response: Response, signals: CacheabilitySignals): string | null {
    if (response.headers.has('Set-Cookie')) return 'set-cookie'
    if (response.status < 200 || response.status > 299) return 'status'
    if (!signals.partitionsResolved) return 'partition-unresolved'

    const inertia = signals.inertia
    if (inertia?.hasFlash) return 'inertia-flash'
    if (inertia?.isPartial) return 'inertia-partial'
    if (inertia?.hasOnceProps) return 'inertia-once'

    return null
  }

  private cacheControl(resolved: ResolvedCacheable): string {
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
   * case and safe. `Cache-Tag` is explicitly deleted (not just omitted)
   * when degrading to `no-store`, so a stale tag from a differently-decided
   * response never lingers.
   */
  private withHeaders(response: Response, headers: Record<string, string>): Response {
    const toSet: Record<string, string | null> = { ...headers }
    if (headers['Cache-Control'] === NO_STORE) toSet['Cache-Tag'] = null

    return setResponseHeaders(response, toSet)
  }
}
