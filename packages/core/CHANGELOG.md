# stratal

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
