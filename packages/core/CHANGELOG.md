# stratal

## 0.0.13

### Patch Changes

- [#120](https://github.com/strataljs/stratal/pull/120) [`8d0df50`](https://github.com/strataljs/stratal/commit/8d0df506411bc725ef4e4eaf4efdb314b3384d98) Thanks [@adesege](https://github.com/adesege)! - Add WebSocket gateway support with `@Gateway`, `@OnMessage`, `@OnClose`, and `@OnError` decorators

  ### Details

  - `@Gateway(path, options?)` decorator marks a class as a WebSocket gateway, reusing controller route metadata for middleware compatibility. Accepts optional `GatewayOptions` with `version` support (single, array, or `VERSION_NEUTRAL`)
  - `@OnMessage()`, `@OnClose()`, `@OnError()` method decorators wire handler methods to WebSocket events
  - `GatewayContext` extends `RouterContext` with WebSocket-specific methods (`send()`, `close()`, `readyState`)
  - `GatewayContext` overrides `param()` and `query()` to use raw Hono request methods (no OpenAPI validation for WebSocket upgrade requests)
  - `GatewayContext.body()` throws `WebSocketBodyNotAvailableError` — WebSocket upgrade requests have no body
  - Gateways support versioning and class-level guards
  - New `stratal/websocket` sub-path export with `GatewayOptions` type

- [#117](https://github.com/strataljs/stratal/pull/117) [`527f675`](https://github.com/strataljs/stratal/commit/527f675ea3b4cdb98165cbe1f81e820fa9e79490) Thanks [@adesege](https://github.com/adesege)! - Add configurable content type support for request and response bodies in route definitions

  ### Details

  - Add `RouteBodyObject` and `RouteResponseObject` types with optional `contentType` field
  - Support `{ schema, contentType }` object form for `body` and `response` in `@Route()` config
  - Bare `ZodType` values default to `application/json` (backward-compatible)
  - Export new types: `RouteBody`, `RouteBodyObject`, `RouteResponseObject`
  - Add `DEFAULT_CONTENT_TYPE` constant
  - Error response schemas always use `application/json` regardless of route content type

- [#115](https://github.com/strataljs/stratal/pull/115) [`bb99119`](https://github.com/strataljs/stratal/commit/bb991196dbcc55963d16ee1a6f5db580c18c796a) Thanks [@adesege](https://github.com/adesege)! - Replace Scalar with Swagger UI as the default OpenAPI docs renderer and add pluggable UI support

  ### Details

  - Replace `@scalar/hono-api-reference` dependency with `@hono/swagger-ui`
  - Add `OpenAPIUIRenderer` type for custom docs UI renderers
  - Add `ui` option to `OpenAPIModuleOptions` with `path` and `renderer` fields
  - Support disabling docs UI entirely by setting `ui: false`
  - Remove `docsPath` option in favor of `ui.path` (default remains `/api/docs`)

  ### Breaking Changes

  - The `docsPath` option in `OpenAPIModuleOptions` has been removed. Use `ui.path` instead:

    ```ts
    // Before
    OpenAPIModule.forRoot({ docsPath: "/docs" });

    // After
    OpenAPIModule.forRoot({ ui: { path: "/docs" } });
    ```

  - The default docs UI is now Swagger UI instead of Scalar. To use a custom renderer (e.g., Scalar), provide a `ui.renderer` function.

- [#119](https://github.com/strataljs/stratal/pull/119) [`957de6e`](https://github.com/strataljs/stratal/commit/957de6e88684344bf26e95d03187345bf77f4f52) Thanks [@adesege](https://github.com/adesege)! - Remove redundant `i18nKey` property from `ApplicationError` and use `Error.message` instead

  ### Details

  - Remove `i18nKey` property — the i18n key is already stored in `Error.message` via `super(i18nKey)`
  - `toErrorResponse()` now uses `this.message` for fallback and stack trace rewriting
  - `GlobalErrorHandler.translateError()` casts `error.message as MessageKeys` for i18n lookup
  - Stack traces in development mode now rewrite the first line with the translated message for readable debugging

- [#118](https://github.com/strataljs/stratal/pull/118) [`0ade941`](https://github.com/strataljs/stratal/commit/0ade94162f9058e9230039fa72efbbf3e57cf572) Thanks [@adesege](https://github.com/adesege)! - Add streaming response methods (`stream`, `streamText`, `streamSSE`) to RouterContext

  ### Details

  - `stream()` — generic/binary streaming via Hono's `stream` helper
  - `streamText()` — text streaming with automatic `Content-Encoding: Identity` for Cloudflare Workers compatibility
  - `streamSSE()` — Server-Sent Events streaming with automatic `Content-Encoding: Identity` for Cloudflare Workers compatibility
  - Re-export `StreamingApi`, `SSEStreamingApi`, and `SSEMessage` types from `stratal/router`

## 0.0.12

### Patch Changes

- [#113](https://github.com/strataljs/stratal/pull/113) [`11b0da9`](https://github.com/strataljs/stratal/commit/11b0da97ef436bffef592fbc34685bbcc85d7ef7) Thanks [@adesege](https://github.com/adesege)! - Add HTTP method decorators (`@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`, `@All`) for explicit route handling as an alternative to convention-based `@Route()` routing

  ### Details

  - **stratal**
    - Add `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`, and `@All` decorators that accept an explicit path and optional `RouteConfig`
    - Routes decorated with `@All` are automatically hidden from OpenAPI documentation
    - Enforce mutual exclusivity: a controller cannot mix `@Route()` with HTTP method decorators
    - Add `statusCode` option to `RouteConfig` for explicit status code control in HTTP method decorators
    - Add `HttpRouteMetadata` type and `'all'` to the `HttpMethod` union
    - Remove `statusCode` from the `@Route()` decorator signature (status codes are auto-derived from method names in convention-based routing)
    - Export new decorators and helpers (`getHttpRouteMetadata`, `getHttpDecoratedMethods`) from `stratal/router`

- [#114](https://github.com/strataljs/stratal/pull/114) [`e1a2ba2`](https://github.com/strataljs/stratal/commit/e1a2ba2da883481d192a15b8015456705982d683) Thanks [@adesege](https://github.com/adesege)! - Add URI-based API versioning support with configurable version prefix and default version

  ### Details

  - **stratal**
    - Add `versioning` option to `ApplicationConfig` to enable URI-based versioning (e.g., `/v1/users`, `/v2/users`)
    - Add `version` option to `ControllerOptions` for per-controller version assignment (single, array, or `VERSION_NEUTRAL`)
    - Add `VERSION_NEUTRAL` sentinel symbol to opt controllers out of versioning even when a `defaultVersion` is set
    - Add `VersioningOptions` type with `prefix` (default `'v'`) and `defaultVersion` fields
    - Add `getControllerVersion()` helper exported from `stratal/router`
    - Extend `RouteRegistrationService` to resolve versioned paths for all route registration patterns (wildcard, OpenAPI, HTTP method, RESTful)
    - Extend `MiddlewareConfigurationService` to resolve versioned `RouteInfo` targets with `version` field
    - Add `version` field to `RouteInfo` middleware type for targeting versioned middleware routes
    - Export `VersioningOptions` and `VERSION_NEUTRAL` from `stratal/router`

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

## 0.0.11

### Patch Changes

- [#92](https://github.com/strataljs/stratal/pull/92) [`bae01ef`](https://github.com/strataljs/stratal/commit/bae01eff7cb7f520ad00206377d9f5f4968076b6) Thanks [@adesege](https://github.com/adesege)! - Update symbol tokens to use 'stratal' namespace for consistency across modules

## 0.0.10

### Patch Changes

- [#88](https://github.com/strataljs/stratal/pull/88) [`3329d20`](https://github.com/strataljs/stratal/commit/3329d20658ea6a6f7cadbbb3efb7630b1cca9ad2) Thanks [@adesege](https://github.com/adesege)! - Add worker base classes (`StratalDurableObject`, `StratalWorkerEntrypoint`, `StratalWorkflow`) with DI support and request-scoped containers

  ### Details

  - Introduce `stratal/workers` sub-path export with `StratalDurableObject`, `StratalWorkerEntrypoint`, `StratalWorkflow`, and `runInScope` helper
  - Add `Stratal.resolveApplication()` static method for worker classes to access the DI container
  - Add `StratalNotInitializedError` for when `resolveApplication()` is called before Stratal is instantiated
  - Add `DurableObjectState` and `DurableObjectId` DI tokens for Durable Object context injection

## 0.0.9

### Patch Changes

- [#86](https://github.com/strataljs/stratal/pull/86) [`c0d9313`](https://github.com/strataljs/stratal/commit/c0d9313b30272eece8a4596718b7d4c1b442c221) Thanks [@adesege](https://github.com/adesege)! - Remove default CORS middleware from HonoApp

  ### Breaking Changes

  - **stratal**: `HonoApp` no longer applies `cors()` middleware by default. If your application relies on the built-in CORS handling, add it explicitly via a custom middleware in your module's `configure()` method or by registering it globally.

## 0.0.8

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

## 0.0.6

### Patch Changes

- [#79](https://github.com/strataljs/stratal/pull/79) [`6542f78`](https://github.com/strataljs/stratal/commit/6542f78fda2bf851df7ee5d88d6f7c7d04ea6388) Thanks [@adesege](https://github.com/adesege)! - Replace `StratalWorker` class with `Stratal` entry point. The new `Stratal` class is a plain object (not a `WorkerEntrypoint` subclass) that lazily initializes the application and exposes `fetch`, `queue`, and `scheduled` handlers directly. This removes the dependency on `cloudflare:workers` and simplifies the worker setup from a class with an abstract `configure()` method to a single `new Stratal({ module: AppModule })` call.

  **Breaking change:** `StratalWorker` and the `stratal/worker` export have been removed. Migrate by replacing:

  ```ts
  // Before
  import { StratalWorker } from "stratal/worker";

  export default class Backend extends StratalWorker<Env> {
    protected configure() {
      return { module: AppModule };
    }
  }

  // After
  import { Stratal } from "stratal";

  export default new Stratal({ module: AppModule });
  ```

## 0.0.5

### Patch Changes

- [#66](https://github.com/strataljs/stratal/pull/66) [`c8ea964`](https://github.com/strataljs/stratal/commit/c8ea964e272b09ebc6619843e77d2b51178f9423) Thanks [@adesege](https://github.com/adesege)! - Add type-safe events system with `@Listener` and `@On` decorators, `EventRegistry` for handler registration and emission, and automatic listener discovery from module providers during application bootstrap. Enhanced DI container with service decoration support.

## 0.0.4

### Patch Changes

- **Lazy i18n context building** — `MessageLoaderService` now lazily builds and caches `CoreContext` per locale on first access instead of eagerly at startup, reducing initialization overhead.
- **Pre-build i18n contexts at startup** — Moved `CoreContext` creation and message flattening from per-request `I18nService` to the singleton `MessageLoaderService`, eliminating repeated work on every `t()` call.
- **Skip stack traces in production** — Added a static flag on `ApplicationError` to disable stack trace capture in production, where traces are stripped from responses anyway.

- **Cross-realm metadata keys** — Migrated all internal metadata symbols from `Symbol()` to `Symbol.for()` with a `stratal:` prefix for reliable cross-realm identity in Cloudflare Workers.
- **Benchmark configuration** — Added a benchmark section to the Vitest config and updated Wrangler compatibility flags for Node.js modules.
- **i18n integration tests** — Added localization integratnning in the workerd pool.

- **Consistent zod imports** — Updated zod imports across benchmark files to use the i18n validation module.
- **Cleaner error handling** — `GlobalErrorHandler` now passes the translated message directly to the logger, avoiding double-translation.

## 0.0.3

### Patch Changes

- - **Lazy i18n context building** — `MessageLoaderService` now lazily builds and caches `CoreContext` per locale on first access instead of eagerly at startup, reducing initialization overhead.
  - **Pre-build i18n contexts at startup** — Moved `CoreContext` creation and message flattening from per-request `I18nService` to the singleton `MessageLoaderService`, eliminating repeated work on every `t()` call.
  - **Skip stack traces in production** — Added a static flag on `ApplicationError` to disable stack trace capture in production, where traces are stripped from responses anyway.

  - **Cross-realm metadata keys** — Migrated all internal metadata symbols from `Symbol()` to `Symbol.for()` with a `stratal:` prefix for reliable cross-realm identity in Cloudflare Workers.
  - **Benchmark configuration** — Added a benchmark section to the Vitest config and updated Wrangler compatibility flags for Node.js modules.
  - **i18n integration tests** — Added localization integratnning in the workerd pool.

  - **Consistent zod imports** — Updated zod imports across benchmark files to use the i18n validation module.
  - **Cleaner error handling** — `GlobalErrorHandler` now passes the translated message directly to the logger, avoiding double-translation.

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
  - stratal@0.0.2

## 0.0.1

### Patch Changes

- Initial release of the Stratal framework — a modular Cloudflare Workers framework built on Hono and tsyringe.

  **Core Infrastructure**

  - NestJS-style module system with `@Module()` decorator, dynamic modules (`withRoot`, `withRootAsync`), and lifecycle hooks (`OnInitialize`, `OnShutdown`)
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
