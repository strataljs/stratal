import { ResponseCacheConfigError } from './errors'
import type { WorkersCache } from './services/response-cache.service'
import type { ResponseCacheModuleOptions } from './types'

/**
 * Fail boot when routes ask for caching the runtime cannot provide.
 *
 * A Worker cannot read its own Wrangler configuration, but the presence of
 * `ctx.cache` tells us whether Workers Caching is enabled for this entrypoint.
 * Without this, a misconfigured deploy would serve every request uncached with
 * no signal at all.
 */
export function assertCachingAvailable(
  cacheableRouteCount: number,
  cache: WorkersCache | undefined,
): void {
  if (cacheableRouteCount === 0) return
  if (cache) return

  throw new ResponseCacheConfigError(
    `${cacheableRouteCount} route(s) declare @Cacheable, but Workers Caching is not available on this entrypoint. ` +
      'Set `"cache": { "enabled": true }` in your Wrangler config, use Wrangler >= 4.69.0, ' +
      'and set `compatibility_date` to 2026-07-06 or later.',
  )
}

/**
 * The one export name a gateway can never forward to: its own.
 *
 * `ctx.exports.default` is the default export — the `Stratal` instance whose
 * `fetch` marks the context as the gateway and dispatches. Forwarding there
 * re-enters the gateway, which marks the *new* context and forwards again,
 * recursing until the runtime's subrequest limit kills the request. Rejecting
 * it at boot is what makes "the cached entrypoint never re-dispatches, so no
 * loop is possible" true rather than merely true-if-configured-correctly.
 */
const SELF_ENTRYPOINT = 'default'

/**
 * Validate the configured entrypoint name itself.
 *
 * Split from the reachability check in `resolveCachedEntrypoint` because this
 * part needs no runtime: a name that is empty, or names the gateway itself, is
 * wrong on inspection and should never reach a first request.
 */
export function assertValidGatewayEntrypoint(options: ResponseCacheModuleOptions): void {
  const gateway = options.gateway
  if (!gateway) return

  const entrypoint = gateway.entrypoint

  if (typeof entrypoint !== 'string' || entrypoint.trim() === '') {
    throw new ResponseCacheConfigError(
      'ResponseCacheModule: `gateway.entrypoint` must be a non-empty export name, e.g. ' +
        '`gateway: { entrypoint: \'Cached\' }` matching `export const Cached = ' +
        'cachedEntrypoint(stratal)`.',
    )
  }

  if (entrypoint === SELF_ENTRYPOINT) {
    throw new ResponseCacheConfigError(
      'ResponseCacheModule: `gateway.entrypoint` cannot be "default" — that is the gateway ' +
        'itself. Forwarding to it would re-enter the gateway, which would forward again, ' +
        'recursing until the Worker hits its subrequest limit. Export a separate cached ' +
        'entrypoint (`export const Cached = cachedEntrypoint(stratal)`) and name that instead, ' +
        'with `cache: { enabled: false }` on `default` and `true` on the named export.',
    )
  }
}

/**
 * Reject the two module options only the gateway entrypoint can act on, when
 * no gateway entrypoint is configured.
 *
 * `partitions` is looked up by `partitionBy`, which `bindRouteCache` rejects
 * under the same condition; `primers` is read only by `GatewayPrimerService`,
 * which the dispatch middleware is the sole caller of. Without
 * `gateway.entrypoint` neither is ever consulted, and accepting them silently
 * is the "option a consumer sets that does nothing" failure this feature is
 * otherwise careful to avoid — an author would reasonably read a configured
 * `partitions` block as proof that per-user keying is in effect. Fail at boot
 * instead, in the same breath as `partitionBy`.
 *
 * Validates the entrypoint name first, so `gateway: { entrypoint: '' }` is
 * reported as the malformed name it is rather than falling through to a
 * "you need a gateway" message about the wrong thing.
 */
export function assertNoGatewayOptions(options: ResponseCacheModuleOptions): void {
  assertValidGatewayEntrypoint(options)

  if (options.gateway !== undefined) return

  if (Object.keys(options.partitions ?? {}).length > 0) {
    throw new ResponseCacheConfigError(
      'ResponseCacheModule: `partitions` requires `gateway: { entrypoint }`. Partition resolvers ' +
        'only run in the gateway, which forwards partitioned reads to a cached entrypoint over ' +
        '`ctx.exports` — without one, the resolvers configured here would never be called and ' +
        'every `partitionBy` route would cache publicly. Add ' +
        '`gateway: { entrypoint: \'Cached\' }` and `export const Cached = cachedEntrypoint(stratal)`, ' +
        'or remove `partitions` (and any `partitionBy`).',
    )
  }

  if ((options.primers?.length ?? 0) > 0) {
    throw new ResponseCacheConfigError(
      'ResponseCacheModule: `primers` requires `gateway: { entrypoint }`. Primers exist to ' +
        'populate the request container before partition resolution runs in the gateway — ' +
        'without a cached entrypoint nothing would ever run them, including ' +
        '`AUTH_GATEWAY_PRIMERS`. Add `gateway: { entrypoint }`, or remove `primers`.',
    )
  }
}
