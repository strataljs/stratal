import type { PurgeSpec } from '../execution-context'
import { ResponseCacheConfigError } from './errors'

/**
 * The two things the gateway asks of the cached entrypoint.
 *
 * `ctx.exports.<Name>` is typed as `Cloudflare.Exports[Name]`, which resolves
 * to `{}` unless the consumer has generated `Cloudflare.GlobalProps` with
 * `wrangler types`. The framework can't require that, and can't name the
 * consumer's export at compile time either — the name arrives as a string in
 * `gateway.entrypoint` — so the stub is described structurally here and the
 * lookup is checked at runtime by `resolveCachedEntrypoint`.
 */
export interface CachedEntrypointStub {
  /** The loopback `fetch`, routed through the cached entrypoint's cache. */
  fetch(request: Request): Promise<Response>
  /**
   * The RPC purge. Purges are scoped to the entrypoint that issues them, and
   * mutations run inline in the *gateway*, whose cache is disabled — so a
   * purge issued there would target an empty cache and silently do nothing.
   * See `cachedEntrypoint`.
   */
  purge(spec: PurgeSpec): Promise<{ success: boolean } | void>
}

/**
 * A loopback binding: callable to bind `ctx.props` for the invocation, and
 * directly usable when no props are needed.
 *
 * `LoopbackServiceStub<T>` in `@cloudflare/workers-types` is
 * `Fetcher<T> & ((opts: { props?: Props }) => Fetcher<T>)` — the callable form
 * is the documented way to choose the callee's `ctx.props`, and `ctx.props` is
 * what places a partition in the cache key.
 */
export type CachedEntrypointBinding = CachedEntrypointStub &
  ((options: { props?: Record<string, string> }) => CachedEntrypointStub)

/**
 * Look up the configured cached entrypoint on `ctx.exports`, failing loudly if
 * it isn't there.
 *
 * A typo in `gateway: { entrypoint: 'Cachd' }`, a missing `export const
 * Cached = ...`, or a missing `enable_ctx_exports` compatibility flag would
 * otherwise all present identically: every partitioned route quietly runs
 * inline in the gateway forever, never caching, with no signal anywhere. The
 * whole point of `partitionBy` refusing to boot without a gateway is that a
 * declared partition is either honoured or it is an error — so this is an
 * error too.
 *
 * @throws {ResponseCacheConfigError} `ctx.exports` is unavailable, or carries
 *   no export under `name`.
 */
export function resolveCachedEntrypoint(ctx: unknown, name: string): CachedEntrypointBinding {
  let exports: unknown
  try {
    exports = (ctx as { exports?: unknown } | null | undefined)?.exports
  } catch (error) {
    // Reading `ctx.exports` throws outright on a Worker without the
    // `enable_ctx_exports` compatibility flag.
    throw new ResponseCacheConfigError(
      `reading \`ctx.exports\` failed (${error instanceof Error ? error.message : String(error)}), so the ` +
        `cached entrypoint "${name}" cannot be reached. Add "enable_ctx_exports" to ` +
        '`compatibility_flags` in your Wrangler config.',
    )
  }

  if (typeof exports !== 'object' || exports === null) {
    throw new ResponseCacheConfigError(
      `\`ctx.exports\` is unavailable on this entrypoint, so the cached entrypoint "${name}" ` +
        'configured via `ResponseCacheModule.forRoot({ gateway: { entrypoint } })` cannot be ' +
        'reached. Add "enable_ctx_exports" to `compatibility_flags` in your Wrangler config, and ' +
        'set `compatibility_date` to 2026-07-06 or later.',
    )
  }

  const binding = (exports as Record<string, unknown>)[name]

  if (binding === undefined || binding === null) {
    const available = Object.keys(exports)
    throw new ResponseCacheConfigError(
      `the cached entrypoint "${name}" is not exported by this Worker. ` +
        '`ResponseCacheModule.forRoot({ gateway: { entrypoint } })` must name a top-level export ' +
        `— \`export const ${name} = cachedEntrypoint(stratal)\` — that is also declared in your ` +
        'Wrangler `exports` block with `cache: { enabled: true }`. Exports visible on ' +
        `\`ctx.exports\`: ${available.length > 0 ? available.join(', ') : '(none)'}.`,
    )
  }

  return binding as CachedEntrypointBinding
}

/**
 * A `WorkersCache` that purges through the cached entrypoint over RPC.
 *
 * Handed to `ResponseCacheService.purge()` in place of the gateway's own
 * `ctx.cache` whenever a gateway is configured and this request is running as
 * the gateway. See `cachedEntrypoint` for why that redirection is required
 * rather than merely tidy.
 */
export function createLoopbackPurgeTarget(ctx: unknown, name: string) {
  return {
    // `async` so an unreachable entrypoint surfaces as a rejection rather than
    // a synchronous throw from a function the `WorkersCache` contract says
    // returns a Promise.
    purge: async (spec: PurgeSpec) => resolveCachedEntrypoint(ctx, name).purge(spec),
  }
}
