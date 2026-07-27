/** A purge request in the shape `ctx.cache.purge()` accepts. */
export interface PurgeSpec {
  tags?: string[]
  pathPrefixes?: string[]
  purgeEverything?: true
}

/**
 * The subset of Cloudflare's Workers Caching API (`ctx.cache`) Stratal uses.
 *
 * Declared here rather than under `response-cache/` so the dependency points
 * from the feature to this foundational module, not the reverse — describing
 * the shape of an execution context should not require knowing about a
 * feature. `stratal/response-cache` re-exports both types, so consumers still
 * import them from there.
 */
export interface WorkersCache {
  purge(spec: PurgeSpec): Promise<{ success: boolean } | void>
}

export interface StratalExecutionContext {
  waitUntil(promise: Promise<unknown>): void
  /**
   * The Cloudflare Workers Caching API (`ctx.cache`). Optional because
   * Wrangler only attaches it when `cache.enabled: true` is configured — see
   * `assertCachingAvailable`, which fails boot when `@Cacheable`/`@PurgesCache`
   * routes exist but this is absent.
   *
   * Declared here (rather than left for call sites to cast onto their own
   * narrower `ExecutionContext`) so `@stratal/testing` can populate a stub on
   * the same object it hands to `Application` and to `HonoApp#fetch`, making
   * cache-decorated routes testable without a real Workers Caching binding.
   */
  cache?: WorkersCache
  /**
   * Loopback bindings to the Worker's own top-level exports (`ctx.exports`),
   * available with the `enable_ctx_exports` compatibility flag.
   *
   * `stratal/response-cache`'s gateway forwards partitioned reads through
   * this, so it is declared here for the same reason `cache` is: so
   * `@stratal/testing` can populate a stub on the object it hands to
   * `Application` and `HonoApp#fetch`. Typed loosely because the shape of any
   * one binding depends on the consumer's own exports, which the framework
   * cannot know — see `resolveCachedEntrypoint`, which checks it at runtime.
   */
  exports?: Record<string, unknown>
  /**
   * The `ctx.props` the caller chose for this invocation. Wholly part of the
   * Workers Caching cache key, which is what makes per-caller partitioning
   * safe. Set by the gateway when it dispatches; never read by the framework.
   */
  props?: unknown
}
