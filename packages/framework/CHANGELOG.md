# @stratal/framework

## 0.0.7

### Patch Changes

- [#81](https://github.com/strataljs/stratal/pull/81) [`89e06b5`](https://github.com/strataljs/stratal/commit/89e06b57f8aca553f60cbefab8f931cf5554f1b3) Thanks [@adesege](https://github.com/adesege)! - Rearchitect core internals: replace AsyncLocalStorage-based request context with explicit container passing, and replace RouterService with HonoApp

  ### Breaking Changes

  **`stratal` (core)**

  - **Removed `RequestContextStore`** — The `AsyncLocalStorage`-based request context propagation is eliminated. This removes the dependency on the `nodejs_als` compatibility flag in Cloudflare Workers.
  - **Removed `RouterService` and `RequestScopeService`** — Replaced by `HonoApp`, a subclass of `OpenAPIHono` that directly integrates request scoping, middleware class support, and global error handling.
  - **Removed `RouterAlreadyConfiguredError` and `RouterNotConfiguredError`** — Replaced by `HonoAppAlreadyConfiguredError`.
  - **`Container` no longer accepts `env` or `ctx` in options** — These are now registered as values in the container by `Application` directly.
  - **`runInRequestScope()` callback signature changed** — The callback now receives `(requestContainer: Container) => T | Promise<T>` instead of `() => T | Promise<T>`. Callers must use the passed container for resolution.
  - **`Stratal` initialization changed from lazy to eager** — `Stratal` now eagerly bootstraps by dynamically importing `cloudflare:workers` for `env` and `waitUntil`, instead of lazily initializing on first request.
  - **`queue()` and `scheduled()` no longer accept `env` and `ctx` parameters** — These are obtained from `cloudflare:workers` during eager init.
  - **New `StratalExecutionContext` interface** — A minimal abstraction over Cloudflare's `ExecutionContext` with only `waitUntil()`.
  - **New `HonoApp` class** — Extends `OpenAPIHono` with Stratal concerns; supports `Constructor<Middleware>` in `use()` via module augmentation.

  **`@stratal/framework`**

  - **`DatabaseConnectionConfig.dialect` changed from `Dialect` to `() => Dialect`** — Database connections now take a factory function for lazy dialect/pool creation.
  - **Caching strategy changed from `instancePerContainerCachingFactory` to `instanceCachingFactory`**.

  **`@stratal/testing`**

  - **`TestingModule.runInRequestScope()` callback now receives a `container` parameter** — Update all callbacks to use the passed container for service resolution.
  - **`TestingModule.fetch()` now routes through `HonoApp`** instead of `RouterService`.
  - **`TestingModuleBuilder.compile()` now applies overrides before `initialize()`** — Fixes issue where overrides were applied after initialization.

  ### Minor Changes

  **`@stratal/seeders`**

  - Updated `executeSeeder()` to use the explicit `requestContainer` parameter from `runInRequestScope()`.

- [#83](https://github.com/strataljs/stratal/pull/83) [`bcb3556`](https://github.com/strataljs/stratal/commit/bcb3556a6e1f185e088286f202c605c73799e63f) Thanks [@adesege](https://github.com/adesege)! - Introduce @stratal/zenstack-plugin and rearchitect database module to use shared schema with per-connection slicing

  ### New Package

  **`@stratal/zenstack-plugin`**

  - ZenStack plugin for multi-connection database support with schema slicing
  - Generates connection-specific schema types and `StratalDatabase` augmentation
  - CLI commands: `stratal-db migrate` and `stratal-db push` for per-connection database management
  - Plugin model (`plugin.zmodel`) for ZenStack integration

  ### Breaking Changes

  **`stratal` (core)**

  - Re-exports `delay` from tsyringe via `stratal/di`

  **`@stratal/framework`**

  - **Replaced `DatabaseSchemaRegistry` and `DefaultDatabaseConnection` with unified `StratalDatabase` interface** — Consumers must update their type augmentations to use the new single interface with `schema`, `defaultConnection`, and `slicing` properties.
  - **`schema` moved from `DatabaseConnectionConfig` to `DatabaseModuleConfig`** — All connections now share a single schema; per-connection schema is no longer supported.
  - **Added `slicing` option to `DatabaseConnectionConfig`** — Connections can narrow available models via ZenStack slicing options.
  - **Database services are now lazily created** — Dialect factories are not called during module initialization; services are instantiated on first resolve within a request scope.
  - **Database services are now request-scoped** — Each request gets its own database client instance via tsyringe's `delay()` + `Scope.Request`.
  - **`DatabaseEvents` type no longer parameterized by connection** — Event types (`ModelName`, `DatabaseEventName`, `GetData`, `GetResult`, etc.) derive from the shared schema instead of per-connection schemas.
  - **Removed `InferConnectionSchema` type** — Replaced by `InferDatabaseSchema` (shared) and `InferConnectionSlicing` (per-connection slicing).

  **`@stratal/testing`**

  - **`TestingModule.getDb()` is now synchronous** — Returns `DatabaseService` directly instead of `Promise<DatabaseService>`.
  - **`TestingModule` creates a single request-scoped container at construction** — `container` property now returns the request-scoped container. The `runInRequestScope` pattern is removed.
  - **`TestingModule.close()` now disposes the request container** before shutting down the application.

- Updated dependencies [[`89e06b5`](https://github.com/strataljs/stratal/commit/89e06b57f8aca553f60cbefab8f931cf5554f1b3), [`bcb3556`](https://github.com/strataljs/stratal/commit/bcb3556a6e1f185e088286f202c605c73799e63f)]:
  - stratal@0.0.7

## 0.0.6

### Patch Changes

- Updated dependencies [[`6542f78`](https://github.com/strataljs/stratal/commit/6542f78fda2bf851df7ee5d88d6f7c7d04ea6388)]:
  - stratal@0.0.6

## 0.0.5

### Patch Changes

- [#66](https://github.com/strataljs/stratal/pull/66) [`c8ea964`](https://github.com/strataljs/stratal/commit/c8ea964e272b09ebc6619843e77d2b51178f9423) Thanks [@adesege](https://github.com/adesege)! - Add AuthModule (Better Auth integration), DatabaseModule (ZenStack ORM with named connections and plugins), RbacModule (Casbin RBAC), AuthGuard factory, AuthContext, Factory base class, and database event types. Includes E2E test suite with Docker Postgres.

- Updated dependencies [[`c8ea964`](https://github.com/strataljs/stratal/commit/c8ea964e272b09ebc6619843e77d2b51178f9423)]:
  - stratal@0.0.5
