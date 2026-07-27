import { WorkerEntrypoint } from 'cloudflare:workers'
import type { StratalEnv } from '../env'
import type { PurgeSpec, WorkersCache } from '../execution-context'
import { ResponseCacheConfigError } from '../response-cache/errors'
import type { Stratal } from '../stratal'

/** What a cached entrypoint instance exposes. */
export interface CachedEntrypoint {
  fetch(request: Request): Promise<Response>
  purge(spec: PurgeSpec): Promise<{ success: boolean } | void>
}

/**
 * The class {@link cachedEntrypoint} returns.
 *
 * Named explicitly rather than inferred: the returned class is an anonymous
 * class *expression*, and `WorkerEntrypoint`'s `ctx`/`env` are `protected`, so
 * inferring it produces a declaration TypeScript refuses to emit (TS4094).
 */
export type CachedEntrypointClass<Env extends StratalEnv = StratalEnv> = new (
  ctx: ExecutionContext,
  env: Env,
) => CachedEntrypoint

/**
 * Build the cached entrypoint that `stratal/response-cache`'s gateway forwards
 * partitioned reads to.
 *
 * ```typescript
 * // src/index.ts
 * import { Stratal } from 'stratal'
 * import { cachedEntrypoint } from 'stratal/workers'
 * import { AppModule } from './app.module'
 *
 * const stratal = new Stratal({ module: AppModule })
 *
 * export default stratal                       // gateway, cache disabled
 * export const Cached = cachedEntrypoint(stratal)  // cache enabled
 * ```
 *
 * ```jsonc
 * // wrangler.jsonc
 * {
 *   "compatibility_date": "2026-07-06",
 *   "compatibility_flags": ["enable_ctx_exports"],
 *   "cache": { "enabled": true },
 *   "exports": {
 *     "default": { "type": "worker", "cache": { "enabled": false } },
 *     "Cached":  { "type": "worker", "cache": { "enabled": true } },
 *   },
 * }
 * ```
 *
 * It runs the **same** `Stratal` instance, and therefore the same Hono app and
 * the same DI graph, as the default export. The only difference is that its
 * execution context is never marked by `markGatewayMode`, so the dispatch
 * middleware is a straight `next()` here — the cached entrypoint never
 * re-dispatches, and a loopback loop is structurally impossible.
 */
export function cachedEntrypoint<Env extends StratalEnv = StratalEnv>(
  stratal: Stratal<Env>,
): CachedEntrypointClass<Env> {
  return class StratalCachedEntrypoint extends WorkerEntrypoint<Env> {
    /**
     * Serve the request from this entrypoint, where Workers Caching is
     * enabled. `this.ctx` carries the `props` the gateway chose; nothing here
     * needs to read them — being part of the cache key is their whole job.
     */
    async fetch(request: Request): Promise<Response> {
      const hono = await stratal.hono
      return hono.fetch(request, this.env, this.ctx)
    }

    /**
     * Purge entries stored by **this** entrypoint.
     *
     * Called over RPC by the gateway, because purges are scoped to the
     * entrypoint that issues them and mutations run inline in the gateway,
     * whose cache is disabled. A purge issued there would target the gateway's
     * own empty cache: it would report success and invalidate nothing, leaving
     * every cached read stale until its TTL expired. See
     * `createLoopbackPurgeTarget`, which is what routes the call here.
     *
     * @throws {ResponseCacheConfigError} `cache.enabled` is not set for this
     *   entrypoint, so there is no cache to purge. Loud, because the caller is
     *   a mutation that has already committed and is relying on this.
     */
    async purge(spec: PurgeSpec): Promise<{ success: boolean } | void> {
      const cache = (this.ctx as unknown as { cache?: WorkersCache }).cache

      if (!cache) {
        throw new ResponseCacheConfigError(
          'the cached entrypoint has no `ctx.cache`, so a purge forwarded from the gateway has ' +
            'nothing to act on. Set `"cache": { "enabled": true }` for this entrypoint in your ' +
            'Wrangler `exports` block, use Wrangler >= 4.69.0, and set `compatibility_date` to ' +
            '2026-07-06 or later.',
        )
      }

      return cache.purge(spec)
    }
  }
}
