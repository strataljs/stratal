import type { PurgeSpec, WorkersCache } from 'stratal/response-cache'

/**
 * In-memory stand-in for Cloudflare Workers Caching's `ctx.cache`.
 *
 * Neither Miniflare nor workerd populates `ExecutionContext.cache` locally,
 * which would otherwise leave every `@Cacheable` route in a test serving
 * uncached and stamped `private, no-store` — so a spec asserting the headers
 * the route declares would read the ones an unconfigured runtime produces. The
 * testing module builder installs this by default so those routes are testable
 * with zero configuration: `@Cacheable` responses carry real
 * `Cache-Control`/`Cache-Tag` headers, and `@PurgesCache` purges are recorded
 * rather than skipped.
 *
 * Every spec passed to `purge()` is recorded, in call order, for assertion
 * via `module.cache.purges`. Purges always succeed — this stub only proves an
 * app's cache configuration is correct, not Workers Caching's own failure
 * modes (that's covered inside `stratal` itself, against a mocked
 * `WorkersCache`). Opt out with `Test.createTestingModule({ cache: false })`
 * to reproduce a runtime where Workers Caching is genuinely unconfigured —
 * e.g. to test the `ResponseCacheConfigError` boot guard.
 */
export class TestWorkersCache implements WorkersCache {
  /** Every spec passed to `purge()`, in call order. */
  readonly purges: PurgeSpec[] = []

  purge(spec: PurgeSpec): Promise<{ success: boolean }> {
    this.purges.push(spec)
    return Promise.resolve({ success: true })
  }
}
