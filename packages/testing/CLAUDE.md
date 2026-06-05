# packages/testing — CLAUDE.md

Maintainer rules for `@stratal/testing`.

## Layout

- Builder + harness: `src/core/` — `Test.createTestingModule()`, override builder, HTTP/WS/SSE/Quarry test request classes.
- Vitest plugin: `src/vitest-plugin/` — `stratalTest()` wraps `@cloudflare/vitest-pool-workers` with Stratal defaults (tslib alias, ZenStack mocks, SSR externals, `fixPgCjs()`).
- Mocks: `src/mocks/` (each ships as its own sub-path entry).
- Storage fake: `src/storage/`.
- Database isolation: `src/database/` (`@stratal/testing/database`) — `createTestDatabaseGlobalSetup` (node global setup) + per-file clone/drop helpers. `pg` imported dynamically (optional peer). The builder (`src/core/testing-module-builder.ts`) provisions a per-file DB and rewrites `env.DB.connectionString`; `TestingModule.close()` drops it.

## Conventions

- Vitest peer is pinned to `^4.1.0`. Bumping it breaks downstream consumers — bump deliberately and changeset.
- When adding plugin defaults, preserve wrap order: pool-workers options must layer last so consumer overrides win.
- Provider override builder lives in `src/core/override/`. New override shape (e.g., `useToken`) plugs into the existing fluent chain — don't fork.
- New mock files follow per-file sub-path pattern: add an `entry` line in `tsdown.config.ts`, tsdown emits the export. Don't reuse a single entry for many mocks — keeping them split lets consumers tree-shake.
- Mock fetch is MSW-based. Lifecycle: `listen()` / `reset()` / `close()`. `http` and `HttpResponse` are re-exported through `src/index.ts`.
- HTTP/WS/SSE/Quarry testers must keep their assertion API consistent with `TestHttpClient` (chainable, returns thenables).

## Testing this package

- No internal test suite (`scripts.test` is absent). Verify changes by running real consumers:
  - `yarn workspace stratal test`
  - `yarn workspace @stratal/framework test:e2e` (after `pretest` + `test:db`)
