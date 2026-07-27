/**
 * Env binding the framework reads to decide DB connection topology. Set by
 * `@stratal/testing` (the test harness runs against a DIRECT Postgres with no
 * Hyperdrive in front); never set in dev / staging / production.
 */
export const DB_SHARED_POOL_ENV = 'STRATAL_DB_SHARED_POOL'

/**
 * Build the lazy pool factory a consumer hands to its ZenStack dialect,
 * choosing the connection topology from the environment instead of hard-coding
 * one. The consumer writes `dialect: () => new PostgresDialect({ pool })` where
 * `pool = createPoolFactory(env, () => new Pool(poolConfig))` — so the prod-vs-
 * test decision lives here, in the framework, not as an `IS_TEST` branch in app
 * config.
 *
 * - **Default (dev / staging / production):** returns a FRESH pool on every
 *   call. The dialect is rebuilt per request resolution, so each request owns
 *   its own pool/socket — mandatory on workerd, where a pool opened in one
 *   request's I/O context cannot be reused by another (the cross-request I/O is
 *   cancelled and the request hangs forever). Hyperdrive fronts these pools and
 *   multiplexes the real server connections, so they never accumulate.
 * - **Shared (`DB_SHARED_POOL_ENV === 'true'`):** memoizes ONE pool per
 *   connection, reused across every resolution. `@stratal/testing` sets this
 *   because the test harness hits a direct Postgres with no Hyperdrive — a fresh
 *   pool per resolution would exhaust `max_connections` across parallel test
 *   files. One shared pool per connection mirrors what Hyperdrive does in prod.
 *
 *   This single pool is forced **persistent** ({@link withPersistentConnection}):
 *   its idle reaper is disabled regardless of the config `makePool` passed. A pool
 *   reused for the whole worker run must never idle-close — a non-zero
 *   `idleTimeoutMillis` reaps its connection between operations, and under real
 *   network latency (a CI Postgres service, not a local socket) that eviction
 *   races in-flight and subsequent queries → "Connection terminated unexpectedly",
 *   cascading into half-applied writes and cross-test row leakage. It passes on a
 *   fast local socket and only surfaces under latency, so consumers can't be
 *   trusted to configure it right — the shared branch enforces it. The consumer's
 *   own idle settings still apply to the fresh-per-resolution prod pools (below).
 *
 * Either way the pool is created LAZILY: `makePool` is invoked by Kysely on the
 * first query, inside the request's I/O context — never at module-eval / global
 * scope, which workerd forbids ("Disallowed operation within global scope").
 */
export function createPoolFactory<TPool>(
  env: object,
  makePool: () => TPool,
): () => Promise<TPool> {
  const shared = (env as Record<string, unknown>)[DB_SHARED_POOL_ENV] === 'true'
  // Returns `Promise<TPool>` (Kysely's dialect contract) without `async` — there
  // is nothing to await; the pool is constructed synchronously and lazily.
  if (!shared) return () => Promise.resolve(makePool())
  let pool: TPool | undefined
  return () => Promise.resolve(pool ??= withPersistentConnection(withIdempotentEnd(makePool())))
}

/**
 * Force a SHARED pool to keep its connection: disable the idle reaper so it is
 * never torn down between operations. The shared pool is ONE connection reused
 * for the whole worker run, so a non-zero `idleTimeoutMillis` (correct for the
 * fresh-per-resolution prod pools, wrong for this long-lived one) reaps it mid-
 * run; under real network latency that eviction races in-flight/next queries →
 * "Connection terminated unexpectedly", cascading into half-applied writes and
 * cross-test row leakage. `pg` reads `options.idleTimeoutMillis`/`allowExitOnIdle`
 * when a client is released, so clearing them on the constructed pool disables
 * future reaping without the consumer having to special-case their pool config.
 * A no-op for pools that don't expose `options` (non-`pg` implementations).
 */
function withPersistentConnection<TPool>(pool: TPool): TPool {
  const candidate = pool as { options?: { idleTimeoutMillis?: number; allowExitOnIdle?: boolean } }
  if (candidate.options) {
    candidate.options.idleTimeoutMillis = 0
    candidate.options.allowExitOnIdle = false
  }
  return pool
}

/**
 * A SHARED pool is handed to every `@Transient` `DatabaseClient`'s dialect, so on
 * shutdown `DatabaseModule.onShutdown` → `disposeInstances` calls `$disconnect()`
 * (→ Kysely `destroy()` → `pool.end()`) once PER live client instance — all of
 * them targeting the single shared pool. pg-pool throws "Called end on pool more
 * than once" on the 2nd+ call, which `disposeInstances` then logs once per extra
 * instance (harmless but noisy, and a real correctness wart). Each owner releasing
 * its reference is legitimate, so make `end()` idempotent: tear the socket down
 * exactly once and have every caller await that same teardown. Fresh-per-resolution
 * pools (the dev/staging/prod default) are untouched — each is already ended once.
 */
function withIdempotentEnd<TPool>(pool: TPool): TPool {
  const candidate = pool as { end?: (...args: unknown[]) => Promise<unknown> }
  if (typeof candidate.end !== 'function') return pool
  const end = candidate.end.bind(candidate)
  let ending: Promise<unknown> | undefined
  candidate.end = () => (ending ??= end())
  return pool
}
