# @stratal/testing

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
