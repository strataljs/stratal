# packages/testing — CLAUDE.md

Maintainer rules for `@stratal/testing`.

## Layout

- Builder + harness: `src/core/` — `Test.createTestingModule()`, override builder, HTTP/WS/SSE/Quarry test request classes.
- Vitest plugin: `src/vitest-plugin/` — `stratalTest()` wraps `@cloudflare/vitest-pool-workers` with Stratal defaults (tslib alias, ZenStack mocks, SSR externals, `fixPgCjs()`).
- Mocks: `src/mocks/` (each ships as its own sub-path entry).
- Storage fake: `src/storage/`.
- Database isolation: `src/database/` (`@stratal/testing/database`) — `createTestDatabaseGlobalSetup` (node global setup) builds a migrated template once; `pg` imported dynamically (optional peer). The builder (`src/core/testing-module-builder.ts`) gives each test FILE its OWN database (`deriveFileDbName` → `<base>_f_<token>`, a crypto-random token generated once per file isolate), cloned from the template via `ensureWorkerDatabase`, and retargets the Hyperdrive binding (`env.DB.connectionString`) to it. Per-**file** (not per-worker-slot) is deliberate: `@cloudflare/vitest-pool-workers` isolates per file and can run a worker's files concurrently, so sharing a database across files corrupts under load — the pool's own storage isolation is per-file, and this matches it. Within a file, tests reset via `truncateDb`/the reset engine. Databases are NOT dropped per file; a global-setup sweep (prefix `databasePrefix` → `<base>_f_`) reclaims them on the next run.

## Conventions

- Vitest peer is pinned to `^4.1.0`. Bumping it breaks downstream consumers — bump deliberately and changeset.
- When adding plugin defaults, preserve wrap order: pool-workers options must layer last so consumer overrides win.
- Provider override builder lives in `src/core/override/`. New override shape (e.g., `useToken`) plugs into the existing fluent chain — don't fork.
- New mock files follow per-file sub-path pattern: add an `entry` line in `tsdown.config.ts`, tsdown emits the export. Don't reuse a single entry for many mocks — keeping them split lets consumers tree-shake.
- Mock fetch is MSW-based. Lifecycle: `listen()` / `reset()` / `close()`. `http` and `HttpResponse` are re-exported through `src/index.ts`.
- HTTP/WS/SSE/Quarry testers must keep their assertion API consistent with `TestHttpClient` (chainable, returns thenables).

## Testing this package

- Node unit project (`vitest.config.ts`, specs under `src/database/__tests__/`) covers the pure DB-isolation helpers (name derivation, fingerprinting, SQL builders) with fake `pg` — no real Postgres needed. Run via `yarn workspace @stratal/testing test`.
- Real database behavior (clone/migrate/truncate against actual Postgres) is still verified by running the framework e2e consumer:
  - `yarn workspace @stratal/framework test:e2e` (after `pretest` + `test:db`)
