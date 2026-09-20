# packages/testing — CLAUDE.md

Maintainer rules for `@stratal/testing`.

## Layout

- Builder + harness: `src/core/` — `Test.createTestingModule()`, override builder, HTTP/WS/SSE/Quarry test request classes.
- Vitest plugin: `src/vitest-plugin/` — `stratalTest()` wraps `@cloudflare/vitest-pool-workers` with Stratal defaults (tslib alias, ZenStack mocks, SSR externals, `fixPgCjs()`).
- Mocks: `src/mocks/` (each ships as its own sub-path entry).
- Storage fake: `src/storage/`.
- Database isolation: `src/database/` (`@stratal/testing/database`) — `createTestDatabaseGlobalSetup` (node global setup) builds a migrated template once; `pg` imported dynamically (optional peer). The builder (`src/core/testing-module-builder.ts`) has each test file lease a worker database (`leaseWorkerDatabase` → `<base>_w_<slot>`): the lowest slot whose Postgres advisory lock is free, held on a connection kept open for the isolate's lifetime. The lease re-clones the template into that database (`cloneWorkerDatabase`) and retargets the Hyperdrive binding (`env.DB.connectionString`) to it. The pool disposes each file's isolate when the file ends, which closes the connection and frees the slot, so a run holds at most as many databases as it runs files at once. This needs `isolate: true` — `stratalTest({ database })` refuses `isolate: false`, because a shared isolate would keep one lease across files. Within a file, tests reset via `truncateDb`/the reset engine. The global setup sweeps unleased, unconnected worker databases (prefix `databasePrefix` → `<base>_w_`) at setup and teardown.

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
