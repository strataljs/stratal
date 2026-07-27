import type { CacheableOptions } from './types'

/** Methods Workers Caching will ever store. Everything else always runs inline. */
const CACHEABLE_METHODS = new Set(['GET', 'HEAD'])

/**
 * Whether the gateway should forward this request into the cached entrypoint.
 *
 * Anything that returns `false` runs inline in the gateway and never reaches
 * the cached entrypoint at all — which is what keeps RFC 9111 heuristic
 * freshness (a `200` with no `Cache-Control` cached for two hours) away from
 * un-annotated routes.
 */
export function shouldLoopback(method: string, cacheable: CacheableOptions | undefined): boolean {
  if (!cacheable) return false
  return CACHEABLE_METHODS.has(method.toUpperCase())
}
