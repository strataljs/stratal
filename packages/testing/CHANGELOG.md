# @stratal/testing

## 0.0.16

### Patch Changes

- [#142](https://github.com/strataljs/stratal/pull/142) [`4b958e2`](https://github.com/strataljs/stratal/commit/4b958e250c99681a99a34a398fbf706546f556cc) Thanks [@adesege](https://github.com/adesege)! - Add dedicated `@stratal/testing/storage` sub-path export and add `reflect-metadata` as peer dependency

  ### Details

  - `FakeStorageService` and `StoredFile` are no longer exported from the main entry point — import from `@stratal/testing/storage` instead
  - Add `reflect-metadata` as a peer dependency

- Updated dependencies [[`3dd0bc8`](https://github.com/strataljs/stratal/commit/3dd0bc84c8638db30db7b70f3532a44aa187ace8), [`4b958e2`](https://github.com/strataljs/stratal/commit/4b958e250c99681a99a34a398fbf706546f556cc), [`4b958e2`](https://github.com/strataljs/stratal/commit/4b958e250c99681a99a34a398fbf706546f556cc)]:
  - stratal@0.0.16
  - @stratal/framework@0.0.16

## 0.0.15

### Patch Changes

- [#125](https://github.com/strataljs/stratal/pull/125) [`0731e99`](https://github.com/strataljs/stratal/commit/0731e99c3e0c96f988387611f0ef8559b63d7bd8) Thanks [@adesege](https://github.com/adesege)! - Add test utilities for Quarry command framework

  ### Details

  - Add `TestCommandRequest` fluent builder for constructing command inputs in tests
  - Add `TestCommandResult` assertion wrapper for command output, exit codes, and errors
  - Add `quarry(name)` method to `TestingModule` for convenient command testing
  - Export new utilities from `@stratal/testing` main entry point

- Updated dependencies [[`0731e99`](https://github.com/strataljs/stratal/commit/0731e99c3e0c96f988387611f0ef8559b63d7bd8), [`52f1daa`](https://github.com/strataljs/stratal/commit/52f1daa981f5a38b983bb3c14abfefb663eb6941)]:
  - stratal@0.0.15
  - @stratal/framework@0.0.15

## 0.0.14

### Patch Changes

- [#124](https://github.com/strataljs/stratal/pull/124) [`59251d3`](https://github.com/strataljs/stratal/commit/59251d32743cbd461f952985f192a68cb7ccdb91) Thanks [@adesege](https://github.com/adesege)! - Add `fixPgCjs()` Vite plugin for CJS resolution of pg sub-dependencies in workerd

  ### Details

  - Replace the `@cloudflare/vitest-pool-workers` yarn patch with a dedicated `fixPgCjs()` Vite plugin
  - `fixPgCjs()` must be applied at the root `defineConfig` level for the module fallback resolver to work correctly
  - `stratalTest()` does NOT automatically apply `fixPgCjs()` — it must be registered separately at the root level
  - Upgrade `@cloudflare/vitest-pool-workers` to ^0.13.2 (unpinned)

- [#122](https://github.com/strataljs/stratal/pull/122) [`47530bd`](https://github.com/strataljs/stratal/commit/47530bd31bc91329788b4ba7b03a389f0e722f46) Thanks [@adesege](https://github.com/adesege)! - Migrate build system from tsc to tsdown for faster builds and code-splitting support

- Updated dependencies [[`59251d3`](https://github.com/strataljs/stratal/commit/59251d32743cbd461f952985f192a68cb7ccdb91), [`59251d3`](https://github.com/strataljs/stratal/commit/59251d32743cbd461f952985f192a68cb7ccdb91), [`47530bd`](https://github.com/strataljs/stratal/commit/47530bd31bc91329788b4ba7b03a389f0e722f46), [`47530bd`](https://github.com/strataljs/stratal/commit/47530bd31bc91329788b4ba7b03a389f0e722f46)]:
  - stratal@0.0.14
  - @stratal/framework@0.0.14

## 0.0.13

### Patch Changes

- [#120](https://github.com/strataljs/stratal/pull/120) [`8d0df50`](https://github.com/strataljs/stratal/commit/8d0df506411bc725ef4e4eaf4efdb314b3384d98) Thanks [@adesege](https://github.com/adesege)! - Add SSE testing utilities with `TestSseRequest` and `TestSseConnection`

  ### Details

  - `TestingModule.sse(path)` creates an SSE test request builder
  - `TestSseRequest` supports custom headers, authentication via `actingAs()`, and automatic `Accept: text/event-stream` header
  - `TestSseConnection` wraps a live SSE stream with assertion helpers: `assertEvent()`, `assertEventData()`, `assertJsonEventData()`, `waitForEvent()`, `waitForEnd()`, `collectEvents()`
  - Replace dynamic `import('vitest')` with static imports in `TestWsConnection`, `TestWsRequest`, and `TestingModule`

- [#120](https://github.com/strataljs/stratal/pull/120) [`8d0df50`](https://github.com/strataljs/stratal/commit/8d0df506411bc725ef4e4eaf4efdb314b3384d98) Thanks [@adesege](https://github.com/adesege)! - Add WebSocket testing utilities with `TestWsRequest` and `TestWsConnection`

  ### Details

  - `TestingModule.ws(path)` creates a WebSocket test request builder
  - `TestWsRequest` supports custom headers, authentication via `actingAs()`, and WebSocket upgrade handshake
  - `TestWsConnection` wraps a live WebSocket with assertion helpers: `assertMessage()`, `assertClosed()`, `waitForMessage()`, `waitForClose()`

- Updated dependencies [[`8d0df50`](https://github.com/strataljs/stratal/commit/8d0df506411bc725ef4e4eaf4efdb314b3384d98), [`527f675`](https://github.com/strataljs/stratal/commit/527f675ea3b4cdb98165cbe1f81e820fa9e79490), [`bb99119`](https://github.com/strataljs/stratal/commit/bb991196dbcc55963d16ee1a6f5db580c18c796a), [`957de6e`](https://github.com/strataljs/stratal/commit/957de6e88684344bf26e95d03187345bf77f4f52), [`0ade941`](https://github.com/strataljs/stratal/commit/0ade94162f9058e9230039fa72efbbf3e57cf572)]:
  - stratal@0.0.13
  - @stratal/framework@0.0.13

## 0.0.12

### Patch Changes

- [#97](https://github.com/strataljs/stratal/pull/97) [`d58b878`](https://github.com/strataljs/stratal/commit/d58b8782848562a50b79cd558eaf01978aa77f26) Thanks [@adesege](https://github.com/adesege)! - Add `stratalTest()` vitest plugin and migrate fetch mocking from Cloudflare's undici-based `fetchMock` to MSW

  ### Details

  - **@stratal/testing**

    - Add `@stratal/testing/vitest-plugin` sub-export with `stratalTest()` — wraps `cloudflareTest` with Stratal defaults (tslib alias, ZenStack mocks, SSR externals)
    - Replace `FetchMock`/`createFetchMock` with `MockFetch`/`createMockFetch` backed by MSW (`setupServer`)
    - Re-export `http` and `HttpResponse` from `msw` for convenience
    - Update `cloudflare:test` imports to `cloudflare:workers`
    - Bump vitest peer dependency from `^3.2.0` to `^4.1.0`

  - **stratal**

    - Update test mocks to use class syntax for Vitest 4 compatibility
    - Bump dependencies: `@intlify/*`, `@scalar/hono-api-reference`, `hono`, `@aws-sdk/*`, `vitest`

  - **@stratal/framework**
    - Refactor vitest config to use `stratalTest()` plugin, removing manual pool/alias config
    - Bump dependencies: `better-auth`, `@zenstackhq/*`, `wrangler`, `vitest`

  ### Breaking Changes

  - **@stratal/testing**: `FetchMock` and `createFetchMock` are removed. Use `MockFetch`/`createMockFetch` instead. The new API uses MSW lifecycle methods (`listen`/`reset`/`close`) instead of `activate`/`disableNetConnect`/`deactivate`.
  - **@stratal/testing**: Vitest peer dependency is now `^4.1.0` (was `^3.2.0`).

- Updated dependencies [[`11b0da9`](https://github.com/strataljs/stratal/commit/11b0da97ef436bffef592fbc34685bbcc85d7ef7), [`e1a2ba2`](https://github.com/strataljs/stratal/commit/e1a2ba2da883481d192a15b8015456705982d683), [`d58b878`](https://github.com/strataljs/stratal/commit/d58b8782848562a50b79cd558eaf01978aa77f26)]:
  - stratal@0.0.12
  - @stratal/framework@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies [[`87581af`](https://github.com/strataljs/stratal/commit/87581af263eb74c059966650fbd5c1b849d36dfc), [`bae01ef`](https://github.com/strataljs/stratal/commit/bae01eff7cb7f520ad00206377d9f5f4968076b6)]:
  - @stratal/framework@0.0.11
  - stratal@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies [[`3329d20`](https://github.com/strataljs/stratal/commit/3329d20658ea6a6f7cadbbb3efb7630b1cca9ad2)]:
  - stratal@0.0.10
  - @stratal/framework@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies [[`c0d9313`](https://github.com/strataljs/stratal/commit/c0d9313b30272eece8a4596718b7d4c1b442c221)]:
  - stratal@0.0.9
  - @stratal/framework@0.0.9

## 0.0.8

### Patch Changes

- Updated dependencies [[`3b38b81`](https://github.com/strataljs/stratal/commit/3b38b8184428dc0f79ffbe9dc55ba782d46dea03)]:
  - @stratal/framework@0.0.8
  - stratal@0.0.8

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
  - @stratal/framework@0.0.7

## 0.0.6

### Patch Changes

- Updated dependencies [[`6542f78`](https://github.com/strataljs/stratal/commit/6542f78fda2bf851df7ee5d88d6f7c7d04ea6388)]:
  - stratal@0.0.6
  - @stratal/framework@0.0.6

## 0.0.5

### Patch Changes

- [#66](https://github.com/strataljs/stratal/pull/66) [`c8ea964`](https://github.com/strataljs/stratal/commit/c8ea964e272b09ebc6619843e77d2b51178f9423) Thanks [@adesege](https://github.com/adesege)! - Add `actingAs` auth test helper, `TestHttpRequest` builder, ZenStack language mock, and enhanced `TestingModule` utilities with new exports and types.

- Updated dependencies [[`c8ea964`](https://github.com/strataljs/stratal/commit/c8ea964e272b09ebc6619843e77d2b51178f9423), [`c8ea964`](https://github.com/strataljs/stratal/commit/c8ea964e272b09ebc6619843e77d2b51178f9423)]:
  - stratal@0.0.5
  - @stratal/framework@0.0.5

## 0.0.4

### Patch Changes

- **Build cleanup** — Removed redundant polyfills export and cleaned up the build configuration.
- **Relaxed vitest version** — Loosened the vitest peer dependency version constraint.

- Updated dependencies []:
  - stratal@0.0.4

## 0.0.3

### Patch Changes

- - **Build cleanup** — Removed redundant polyfills export and cleaned up the build configuration.
  - **Relaxed vitest version** — Loosened the vitest peer dependency version constraint.
- Updated dependencies []:
  - stratal@0.0.3

## 0.0.2

### Patch Changes

#### `stratal` (core)

##### Breaking Changes

- **`withRoot`/`withRootAsync` renamed to `forRoot`/`forRootAsync`** — All dynamic module configuration methods have been renamed for consistency. Update every `SomeModule.withRoot(...)` call to `SomeModule.forRoot(...)` and `SomeModule.withRootAsync(...)` to `SomeModule.forRootAsync(...)`. ([`152913a`](https://github.com/strataljs/stratal/commit/152913a))

- **Barrel export removed — use sub-path imports** — The top-level `stratal` barrel export has been removed. Consumers must now import from sub-paths (`stratal/di`, `stratal/router`, `stratal/cache`, `stratal/validation`, etc.). ([`af073d8`](https://github.com/strataljs/stratal/commit/af073d8))

##### Features

- **DOM polyfill for Cloudflare Workers** — Added a DOM polyfill to support AWS SDK v3 XML parsing in Cloudflare Workers environments. ([`f3b2cb9`](https://github.com/strataljs/stratal/commit/f3b2cb9))

- **Benchmark suite** — Added benchmark functionality for measuring framework performa30438`](https://github.com/strataljs/stratal/commit/7230438))

##### Security

- **ConfigService blocks prototype pollution** — `ConfigService` now rejects dangerous keys (`__proto__`, `constructor`, `prototype`) to prevent prototype pollution attacks. ([`567139c`](https://github.com/strataljs/stratal/commit/567139c), [`e64b4e7`](https://github.com/strataljs/stratal/commit/e64b4e7))

##### Bug Fixes

- **`reflect-metadata` import moved to vitest setup** — Removed unused `reflect-metadata` imports from example files and centralized the import in `vitest.setup.ts`. ([`f3b2cb9`](https://github.com/strataljs/stratal/commit/f3b2cb9))

---

#### `@stratal/testing`

##### Breaking Changes

- **Import paths updated** — Import paths updated to match the new core sub-path exports (e.g. `stratal/di` instead of the barrel `stratal`). ([`af073d8`](https://github.com/strataljs/stratal/commit/af073d8))

- Updated dependencies []:
  - @stratal/testing@0.0.2

## 0.0.1

### Patch Changes

- Initial release of the Stratal framework — a modular Cloudflare Workers framework built on Hono and tsyringe.

  **Core Infrastructure**

  - NestJS-style module system with `@Module()` decorator, dynamic modules (`forRoot`, `forRootAsync`), and lifecycle hooks (`OnInitialize`, `OnShutdown`)
  - Two-tier dependency injection container (global singletons + request-scoped) powered by tsyringe with conditional registration and service decoration
  - `StratalWorker` entry point extending Cloudflare's `WorkerEntrypoint` for HTTP fetch, queue batches, and scheduled cron triggers

  **Routing & API**

  - Hono-based routing with `@Controller()` and `@Route()` decorators, automatic controller discovery, and route guards via `@UseGuards()`
  - OpenAPI schema generation with `@hono/zod-openapi` and Scalar API reference integration
  - NestJS-like middleware configuration with route-specific application and exclusion

  **Background Processing**

  - Queue consumerfor Cloudflare Queues with `@Consumer()` and `@QueueJob()` decorators and batch processing
  - Cron job scheduling via `CronManager` integrated with Cloudflare's scheduled events

  **Services & Integrations**

  - Email module with pluggable providers (Nodemailer, Resend) and queue-based sending
  - Storage module with AWS S3 / Cloudflare R2 support, multipart uploads, presigned URLs, and TUS resumable uploads
  - Internationalization (i18n) module with locale detection, message compilation, and request-scoped translations
  - Cache module with pluggable providers and Cloudflare KV integration
  - Configuration module with `registerAs()` namespaces and Zod-based validation
  - Structured logging with JSON and pretty formatters

  **Developer Experience**

  - Zod-powered request/response validation with type inference
  - Custom `ApplicationError` class with HTTP status mapping
  - ESM-only with full TypeScript decorator support (`emitDecoratorMetadata`)
  - Sub-path exports for tree-shakeable imports (`stratal/di`, `stratal/router`, `stratal/cache`, etc.)

  - `TestingModule` and `TestingModuleBuilder` for bootstrapping isolated module environments in tests
  - `TestHttpClient` with request builder and response wrapper for integration testing
  - `FetchMock` for mocking HTTP fetch calls
  - `FakeStorageService` for in-memory storage testing without S3/R2
  - `ProviderOverrideBuilder` for replacing providers with test doubles
  - Nodemailer mock for email testing
  - Test environment utilities via `getTestEnv()`

- Updated dependencies []:
  - stratal@0.0.1
