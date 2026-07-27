# packages/framework — CLAUDE.md

Maintainer rules for `@stratal/framework`.

## Layout

- `src/auth/` — Better Auth integration; `AuthModule.forRootAsync()`; `AuthService`; auth middleware pipeline.
- `src/context/` — `AuthContext` (request-scoped).
- `src/database/` — `DatabaseModule`, ZenStack ORM wrapper, `@InjectDB(name)` decorator, plugins under `src/database/plugins/` (ErrorHandler, EventEmitter, SchemaSwitcher), commands under `src/database/commands/`, custom Postgres types in `src/database/custom-pg-types.ts`.
- `src/access-control/` — Casbin + ZenStack adapter (`./access-control` sub-path export). `CasbinService` is request-scoped.
- `src/rbac/` — RBAC helpers (internal — not in `package.json` exports). Don't add an export entry without confirming consumer surface.
- `src/factory/` — `Factory` abstract base + `Sequence` for test data.
- `src/guards/` — `AuthGuard` factory (auth + optional permission check).

## Codegen — read this before running tests

- **Always run `yarn workspace @stratal/framework pretest` before tests.** It runs `npx dotenv -- yarn generate && yarn generate:types` (ZenStack schema gen + Wrangler type gen). Skipping produces stale generated types and confusing test failures.
- ZenStack schema: `test/schema.zmodel`. Generated output: `test/zenstack/` — gitignored, don't commit.
- Wrangler types come from `test/wrangler.jsonc`.

## Testing

- Two Vitest projects:
  - **unit** — node env, `src/**/__tests__/**/*.spec.ts`
  - **e2e** — `test/e2e/**/*.spec.ts`, Miniflare + Hyperdrive→Postgres
- E2E needs Docker Postgres on port 5438: `yarn workspace @stratal/framework test:db`. CI runs Postgres as a service container.
- E2E runs **in parallel with one database per Vitest worker** via `stratalTest({ database: {} })`. `test/global-setup.ts` builds a migrated template (`createTestDatabaseGlobalSetup` from `@stratal/testing/database`); each worker clones it once and resets state between tests — worker databases are reused across files, not dropped per file. `DATABASE_URL` is the single source of truth — test scripts wrap with `npx dotenv` so it reaches `vitest.config.ts` and global setup. Don't reintroduce `fileParallelism: false`.
- Coverage provider: `istanbul` (different from core's v8 — don't unify without intent).

## Conventions

- tsconfig path aliases: `@stratal/framework` → `./src/index.ts`, `@stratal/framework/*` → `./src/*/index.ts`. New top-level dir = new alias entry in `tsconfig.json`.
- DatabaseModule plugins are stacked at construction; order is meaningful — preserve existing order when adding plugins.
- New named connection: update `DatabaseSchemaRegistry` augmentation contract (in consumer code) and the `@InjectDB(name)` lookup; both must agree.
- Database events follow `{phase}.{Model}.{operation}` (e.g., `after.User.create`). Adding a new phase or operation requires updating the wildcard resolver in core's `EventRegistry` and the type augmentation `DatabaseEvents<ConnectionName>` in `src/database/event-types.ts`.
- `AuthContext` and `CasbinService` are request-scoped. Never inject as singletons — they hold per-request state.
- New factories must be re-exported through `src/factory/index.ts` to be visible at `@stratal/framework/factory`.
