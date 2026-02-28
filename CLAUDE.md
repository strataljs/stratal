# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stratal is a modular Cloudflare Workers framework with dependency injection (tsyringe), Hono-based routing with OpenAPI generation, queue consumers, cron jobs, i18n, caching, storage, and email. It's a yarn workspaces monorepo with two packages:

- `packages/core` (npm: `stratal`) — the framework
- `packages/testing` (npm: `@stratal/testing`) — test utilities, mocks, factories

## Common Commands

```bash
# Lint (all packages)
yarn lint
yarn lint:fix

# Type check
yarn workspace stratal typecheck
yarn workspace @stratal/testing typecheck

# Tests (core package only — testing package has no tests)
yarn workspace stratal test
yarn workspace stratal test:watch
yarn workspace stratal test:coverage

# Run a single test file
yarn workspace stratal test src/path/to/__tests__/file.spec.ts

# Build
yarn workspace stratal build
yarn workspace @stratal/testing build

# Changesets (run before committing version-worthy changes)
yarn changeset
```

## Build System

Build uses `tsc -p tsconfig.build.json` — **not** esbuild/tsup. This is required because tsyringe depends on `emitDecoratorMetadata` which esbuild doesn't support. Both `experimentalDecorators` and `emitDecoratorMetadata` must stay enabled in tsconfig.

The project is ESM-only (`"type": "module"`). Output goes to `dist/` with `.js`, `.d.ts`, `.d.ts.map`, and `.js.map` files.

## Testing

- Framework: Vitest
- Test file convention: `src/**/__tests__/**/*.spec.ts`
- Setup file (`vitest.setup.ts`) imports `reflect-metadata` — required for tsyringe decorator metadata
- Coverage excludes: `__tests__/`, `*.spec.ts`, `index.ts`, `types.ts`, `tokens.ts`

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
- Service decoration: `extend(token, decorator)`
- DI tokens defined in `packages/core/src/di/tokens.ts` (Symbol-based)

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

### Sub-path Exports

The package exposes sub-paths: `stratal/di`, `stratal/router`, `stratal/validation`, `stratal/errors`, `stratal/i18n`, `stratal/cache`, `stratal/logger`, plus a wildcard `./*` mapping to `./dist/*/index.js`.

## Code Conventions

- Symbol-based DI tokens (not string tokens)
- Constructor injection with `@inject(TOKEN)` decorators
- Inline type imports enforced (`consistent-type-imports` ESLint rule)
- Leading-underscore allowed for unused variables
- Heavy dependencies (AWS SDK, React, nodemailer, resend, @tus/server) are optional peerDependencies
- Pre-commit hook: husky + lint-staged runs `eslint --fix` on staged `.ts/.mts` files

## CI/CD

- **CI** (`.github/workflows/ci.yml`): lint, typecheck, test, build — runs on push to main and PRs
- **Publish** (`.github/workflows/publish.yml`): changesets-based — auto-creates release PRs and publishes to npm on merge
