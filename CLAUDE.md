# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stratal is a modular Cloudflare Workers framework with dependency injection (tsyringe), Hono-based routing with OpenAPI generation, queue consumers, cron jobs, i18n, caching, storage, and email. It's a yarn workspaces monorepo with four packages:

- `packages/core` (npm: `stratal`) — the core framework
- `packages/testing` (npm: `@stratal/testing`) — test utilities, mocks, factories
- `packages/framework` (npm: `@stratal/framework`) — auth, database ORM (ZenStack), RBAC (Casbin), guards, and test data factories
- `packages/seeders` (npm: `@stratal/seeders`) — CLI tool and infrastructure for database seeding

## Common Commands

```bash
# Lint (all packages)
yarn lint
yarn lint:fix

# Type check
yarn workspace stratal typecheck
yarn workspace @stratal/testing typecheck
yarn workspace @stratal/framework typecheck
yarn workspace @stratal/seeders typecheck

# Tests — core
yarn workspace stratal test
yarn workspace stratal test:watch
yarn workspace stratal test:coverage

# Tests — framework (requires pretest for ZenStack + Wrangler codegen)
yarn workspace @stratal/framework pretest   # generate schema + types
yarn workspace @stratal/framework test
yarn workspace @stratal/framework test:watch
yarn workspace @stratal/framework test:e2e
yarn workspace @stratal/framework test:coverage
yarn workspace @stratal/framework test:db   # start Docker Compose Postgres

# Run a single test file
yarn workspace stratal test src/path/to/__tests__/file.spec.ts
yarn workspace @stratal/framework test src/path/to/__tests__/file.spec.ts

# Build
yarn workspace stratal build
yarn workspace @stratal/testing build
yarn workspace @stratal/framework build
yarn workspace @stratal/seeders build

# Benchmarks (core only)
yarn workspace stratal bench
yarn workspace stratal bench:json

# Changesets (run before committing version-worthy changes)
yarn changeset
```

## Build System

All packages use `tsc -p tsconfig.build.json` — **not** esbuild/tsup. This is required because tsyringe depends on `emitDecoratorMetadata` which esbuild doesn't support. Both `experimentalDecorators` and `emitDecoratorMetadata` must stay enabled in tsconfig.

The project is ESM-only (`"type": "module"`). Output goes to `dist/` with `.js`, `.d.ts`, `.d.ts.map`, and `.js.map` files.

**Framework package** has path aliases in its tsconfig (`@stratal/framework` → `./src/index.ts`, `@stratal/framework/*` → `./src/*/index.ts`).

**Seeders package** uses `@swc-node/register` at runtime for TypeScript + decorator support when running the CLI, but builds with `tsc` like the other packages.

## Testing

### Core (`packages/core`)

- Framework: Vitest
- Test file convention: `src/**/__tests__/**/*.spec.ts`
- Setup file (`vitest.setup.ts`) imports `reflect-metadata` — required for tsyringe decorator metadata
- Coverage excludes: `__tests__/`, `*.spec.ts`, `index.ts`, `types.ts`, `tokens.ts`

### Framework (`packages/framework`)

- Framework: Vitest with two projects: **unit** (node environment) and **e2e** (Cloudflare Workers via `@cloudflare/vitest-pool-workers`)
- Unit tests: `src/**/__tests__/**/*.spec.ts`; E2E tests: `test/e2e/**/*.spec.ts`
- **Pretest required**: `yarn workspace @stratal/framework pretest` runs ZenStack schema generation + Wrangler type generation before tests
- E2E tests require Docker Postgres on port 5438 (`yarn workspace @stratal/framework test:db`)
- Coverage provider: `istanbul`
- E2E pool options: Miniflare with Hyperdrive configured to PostgreSQL

### Seeders (`packages/seeders`)

- No tests currently

## Architecture

### Application Initialization (6 phases)

`packages/core/src/application.ts` — the `Application` class bootstraps in order:

1. Register core infrastructure modules (I18n, OpenAPI, Queue, Cache)
2. Register the user's root module (recursively traverses imports)
3. Initialize all modules (calls `onInitialize` lifecycle hooks)
4. Resolve managers (ConsumerRegistry, CronManager)
5. Register RouterService
6. Configure routes, queues, and cron jobs

### Dependency Injection (two-tier container)

`packages/core/src/di/container.ts` — wraps tsyringe with:

- **Global container**: singletons and base registrations
- **Request container**: child container per HTTP request for `Scope.Request` services
- Conditional registration: `when(predicate).use(token).give(impl).otherwise(fallback)`
- Service decoration: `extend(token, decorator)` — wraps an existing registration with a decorator class
- DI tokens defined in `packages/core/src/di/tokens.ts` (Symbol-based)

### Events System

`packages/core/src/events/` — type-safe event registry with decorator-driven wiring:

- `@Listener()` marks a class as an event listener (auto-applies `@Transient()` for DI)
- `@On(event, options?)` registers a method as a handler for a specific event (supports `priority` and `blocking` options)
- `EventRegistry` manages handler registration and emission
- Listeners are auto-discovered from module `providers` and wired at bootstrap time
- `CustomEventRegistry` interface is augmentable for type-safe event names and contexts

### Module System

`packages/core/src/module/` — NestJS-style `@Module()` decorator pattern:

- Modules declare `providers`, `controllers`, `consumers`, `jobs`, and `imports`
- Dynamic modules via `forRoot()` (sync) and `forRootAsync()` (factory)
- Lifecycle hooks: `OnInitialize`, `OnShutdown`
- Middleware via `MiddlewareConfigurable.configure()`

### Worker Entry Point

`packages/core/src/worker/stratal-worker.ts` — `StratalWorker` extends Cloudflare's `WorkerEntrypoint`. Handles HTTP fetch, queue batches, and scheduled cron triggers. Uses singleton Application pattern with concurrent initialization guard.

### Routing

`packages/core/src/router/` — Hono-based with `@Controller(path)` and `@Route(metadata)` decorators. Controllers are auto-discovered from modules. OpenAPI schemas generated via `@hono/zod-openapi`.

### Framework Modules (`packages/framework`)

- **DatabaseModule** — ZenStack ORM with multiple named connections, plugin system (ErrorHandler, EventEmitter, SchemaSwitcher), and augmentable `DatabaseSchemaRegistry`/`DefaultDatabaseConnection` interfaces for type-safe access. Uses `@InjectDB(name)` decorator for named connection injection.
- **AuthModule** — Better Auth integration with session verification middleware pipeline. Provides `AuthContext` (request-scoped) and `AuthService`. Configured via `AuthModule.withRootAsync()`.
- **RbacModule** — Casbin-based RBAC with ZenStack database adapter. Provides `CasbinService` (request-scoped) for permission checks, role management, and `getPermissionsForUserAsCasbinJs()` for frontend.
- **AuthGuard** — Guard factory for authentication and scoped authorization. Checks `AuthContext.isAuthenticated()` and optionally `CasbinService.hasAnyPermission()`.
- **Factory** — Abstract base class for test data factories with `@faker-js/faker` integration and `Sequence` generator.

### Database Events (Framework)

The framework extends core's event system for database operations:

- Events follow the pattern `{phase}.{Model}.{operation}` (e.g., `after.User.create`)
- Supports wildcard patterns: `after.User` (model wildcard), `after.create` (operation wildcard)
- Type-safe contexts via discriminated unions and `DatabaseSchemaRegistry` augmentation
- Emitted by `EventEmitterPlugin` (ZenStack runtime plugin) before/after each database operation
- Augment `CustomEventRegistry` with `DatabaseEvents<ConnectionName>` for full type safety

### Seeders CLI (`packages/seeders`)

- `Seeder` abstract base class — extend and implement `run()` for seeding logic
- `SeederRunner.run(AppModule)` — bootstraps application, discovers seeders from module tree, runs CLI
- Auto-discovery: walks module `providers` recursively, finds classes extending `Seeder`
- CLI commands: `run <seeder>`, `run --all`, `list`; supports `--dry-run`
- Naming convention: `UserSeeder` → CLI name `user`, `RolePermissionsSeeder` → `role-permissions`
- Seeders execute within request-scoped DI containers (full access to injected services)
- Uses `wrangler` `getPlatformProxy()` for Cloudflare bindings at runtime

### Sub-path Exports

**Core (`stratal`)**: `stratal/errors`, `stratal/i18n`, `stratal/i18n/messages/en`, `stratal/validation`, plus wildcard `./*` mapping to `./dist/*/index.js` (covers `stratal/di`, `stratal/router`, `stratal/cache`, `stratal/logger`, `stratal/events`, etc.)

**Framework (`@stratal/framework`)**: `@stratal/framework/auth`, `@stratal/framework/context`, `@stratal/framework/database`, `@stratal/framework/factory`, `@stratal/framework/guards`, `@stratal/framework/rbac`

**Seeders (`@stratal/seeders`)**: single export `.` (also provides `stratal-seed` CLI bin)

## Code Conventions

- Symbol-based DI tokens (not string tokens)
- Constructor injection with `@inject(TOKEN)` decorators
- Inline type imports enforced (`consistent-type-imports` ESLint rule)
- Leading-underscore allowed for unused variables
- Heavy dependencies (AWS SDK, React, nodemailer, resend, @tus/server) are optional peerDependencies
- Pre-commit hook: husky + lint-staged runs `eslint --fix` on staged `.ts/.mts` files

## CI/CD

- **CI** (`.github/workflows/ci.yml`): lint, typecheck, test, build for core, testing, and framework packages. Framework tests run with a PostgreSQL service container and require `pretest` for schema generation. Runs on push to main and PRs.
- **Publish** (`.github/workflows/publish.yml`): changesets-based — publishes `stratal` and `@stratal/testing` to npm on tag push. Creates GitHub Release with auto-generated notes.
- **Benchmark** (`.github/workflows/benchmark.yml`): runs `yarn workspace stratal bench:json`, stores results in `strataljs/benchmarks` repo with GitHub Pages, compares on PRs with 150% alert threshold.
- **Docs** (`.github/workflows/docs.yml`): builds core + testing, runs `yarn docs`, deploys to GitHub Pages.
- **CodeQL** (`.github/workflows/codeql.yml`): TypeScript security analysis on push to main, PRs, and weekly schedule.
- **Dependency Review** (`.github/workflows/dependency-review.yml`): scans dependency changes on PRs for known vulnerabilities.
- **Scorecard** (`.github/workflows/scorecard.yml`): OSSF supply-chain security analysis.
