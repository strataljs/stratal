---
"@stratal/testing": minor
---

Give each test file its own leased database, drain deferred work before a test finishes, and supply the cache and gateway bindings the runtime never populates.

### Database isolation

- Give every test **file** its own database, leased from a fixed pool of worker slots rather than created per file. Each file takes the lowest free slot, `<base>_w_<slot>`, and gets a fresh clone of the migrated template in it; the slot frees when the pool disposes the file's isolate. A run therefore holds at most as many databases as it runs files at once, so a long suite no longer piles up one database per file until Postgres runs out of disk mid-run.
- Per-file isolation is deliberate: the Workers test pool isolates storage per file and can run a worker's files concurrently, so any database shared across files corrupts under CI latency. Within a file, tests reset state through `truncateDb` or the reset engine.
- `createTestDatabaseGlobalSetup` accepts a one-time `prepare` hook to bake expensive baseline state — seed data, a default tenant schema — into the template once, so every file's database inherits it through the clone instead of rebuilding it per test.
- `createTestDatabaseGlobalSetup` now returns a teardown, so a run reclaims what it created instead of leaving the leftovers for the next run's setup to find. Consumers pass it to `globalSetup` exactly as before and need no change. The sweep is connection-guarded and skips a slot that is currently leased, so a database cloned but not yet connected to is never dropped by a concurrent process.
- `truncateDb(name?, opts?)` accepts a `ResetOptions` preserve-list; migration tables matching `_prisma%` are always preserved.
- Default database-isolation projects to a 30 second hook timeout, since cloning a template under a full worker slot routinely exceeds Vitest's 10 second default and fails with "Hook timed out in 10000ms". This is a floor, not a ceiling: an explicit `hookTimeout`, `fileParallelism` or `isolate` on the consuming project is now respected instead of being overwritten.
- Share one database pool per connection in the harness and tear it down exactly once. The harness runs against a direct Postgres with no Hyperdrive to multiplex, so a fresh pool per resolution accumulated until parallel files exhausted the server's connection limit with "sorry, too many clients already". Disposing a connection no longer logs "Called end on pool more than once".

### Bindings and lifecycle

- Supply the `ctx.cache` binding so cache-decorated routes are testable with no configuration. Neither Miniflare nor workerd populates it, so without this a single `@Cacheable` or `@PurgesCache` route would fail an app's entire suite on the first request. `Test.createTestingModule()` installs a stub by default: `@Cacheable` routes return real `Cache-Control` and `Cache-Tag` headers, and purges succeed, recording each `PurgeSpec` in call order on `module.cache.purges`. Pass `cache: false` to opt back into the unconfigured runtime.
- Supply a `ctx.exports` stub by default so adopting the response-cache gateway does not break existing suites. Assert forwarded requests and their resolved partitions through `module.gateway.loopbacks`. The stub answers to any export name, so a passing suite is not what proves your configured entrypoint is correct — the type check against your Worker's exports is.
- Drain work a request defers through `ctx.waitUntil` before `fetch()` resolves, mirroring the Workers runtime. A non-blocking listener's deferred database write previously stayed in flight past the response and could still be running at the next request or at teardown, where disposing that resource hung the suite past the hook timeout.
- Drain deferred work in `close()` before tearing the app down. `fetch()` already drained per call, but the websocket, SSE and Quarry helpers share the same queue, so a suite using only those could reach teardown with writes still in flight and race the connection pool's disposal.

### Testing surface

- `Test.createTestingModule()` accepts `trailingSlash` and `versioning` and passes both to the `Application` it builds, taking the same shapes as on the `Stratal` constructor. A testing module never runs the app's entry file, so an app configuring either there previously had it in production only — its suite asserted URL shapes that configuration would never emit. Both stay unset by default.
- Support `head()`, `list()` and `deleteMany()` in fake storage, so the new storage methods are exercisable without R2. `list()` returns **one object per page** unless a `limit` is passed, so a caller that ignores `cursor` fails in tests instead of undercounting against a real bucket, and `contentType` and `metadata` are omitted unless `includeMetadata: true`, matching what R2 returns.
- Stop `module.inertia` sending a hard-coded `X-Inertia-Version`. It sent `'1'`, so any app configuring a real asset version had every request read as a stale client and answered with a 409 — an entire Inertia suite failing on a value the tests never chose. A test that wants the mismatch path can ask for it with `module.inertia.withHeaders({ 'X-Inertia-Version': 'stale' })`.
- Fix chunked uploads to the fake storage service failing with `ReadableStream is disturbed` when the body is a single-use stream, which is the shape a chunked upload delivers.
- Keep `stratalTest()` typed against a single Vite instance. Vitest and `@stratal/inertia` resolved two different copies, which surfaced as a `Plugin` that would not assign to `Plugin`, an "excessive stack depth" comparison, and a missing `test` key on `UserConfig`.

### Breaking Changes

- **There is now a single database isolation model.** The `shared` and `database` isolation toggle is gone, along with the `isolation` option on both `stratalTest({ database })` and `createTestDatabaseGlobalSetup`. Pass `stratalTest({ database: {} })` to enable isolation and delete any `isolation:` option.
- **`stratalTest({ database })` now requires `isolate: true`** and throws on `isolate: false`.
- **`createTestDatabaseGlobalSetup` now requires `schema`.** Add it if you were relying on the previous default.
- **`@cloudflare/vitest-pool-workers` is now `@cloudflare/vitest-plugin`.** Update the dependency, any direct import of it, and the `types` entry in your test `tsconfig.json`. `npx @cloudflare/codemods vitest:pool-workers-to-vitest-plugin` does all three. A config that only calls `stratalTest()` needs no change beyond the dependency. `stratalTest()` and its options are unchanged, and the integration supports Vitest 4.1 and later.
