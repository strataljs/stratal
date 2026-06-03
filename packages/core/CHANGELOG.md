# stratal

## 0.0.24

## 0.0.23

### Patch Changes

- 13b0e8d: Reorganize core subsystem registries into modules

  The event, cron, quarry, and seeder registries — previously registered imperatively in `Application` — are now declared as ordinary `@Module`s (`EventsModule`, `CronModule`, `QuarryModule`, `SeederModule`), consistent with every other subsystem. The `Application` constructor now only sets up the bootstrap kernel (`ExceptionHandler`, `LazyModuleLoader`, logging); all module registration happens during initialization. `application.ts` has no static subsystem imports — every built-in module is loaded via dynamic `import()`.

  ### Breaking Changes

  - **`EventRegistry`, `QuarryRegistry`, `CronManager`, `SeederRegistry` are now `@Singleton`** (they were `@Transient` but always force-registered as singletons). This aligns the class decorator with their actual lifecycle; their canonical DI tokens are declared on the decorator.
  - **`SeederRegistry` now injects the `Application`** (`@inject(DI_TOKENS.Application)`) instead of being constructed manually.
  - **`@stratal/framework` `DatabaseModule.onInitialize` is now `async`** and loads `EventsModule` on demand via `LazyModuleLoader` (the event registry is no longer eagerly registered). No change is required for apps that use `DatabaseModule` normally.
  - New public modules are exported from their sub-paths: `EventsModule` (`stratal/events`), `CronModule` (`stratal/cron`), `QuarryModule` (`stratal/quarry`), `SeederModule` (`stratal/seeder`).
  - The `schedule:list` command now lazy-loads `CronModule` via `LazyModuleLoader` rather than injecting `DI_TOKENS.Cron`; with no jobs registered it prints "No cron jobs found" instead of failing to resolve.

- 13b0e8d: Replace the email provider layer with a built-in Cloudflare Workers-compatible SMTP client and defer React Email rendering

  - Email is now sent through a built-in SMTP client and MIME builder, removing the runtime dependency on `nodemailer`.
  - `@react-email/render` is loaded on demand only when sending a React template, reducing cold-start overhead for requests that don't send email.

  ### Breaking Changes

  - **Resend provider removed.** Switch to SMTP. Remove the `provider` and `apiKey` options from your email configuration and remove `resend` from your dependencies.
  - **SMTP configuration uses a connection URL.** Replace individual `host`/`port`/`secure`/`username`/`password` fields with a single `url`:

    ```ts
    // Before
    smtp: { host: 'smtp.example.com', port: 587, username: 'user', password: 'pass' }
    // After
    smtp: { url: 'smtp://user:pass@smtp.example.com:587' } // or smtps:// for TLS
    ```

  - **Dependencies changed.** `nodemailer`, `resend`, and `@react-email/components` are no longer peer dependencies. If you render React email templates, install `@react-email/render` directly.

- 13b0e8d: Add lazy module loading and reduce cold start by loading built-in subsystems on demand

  ### New: `LazyModuleLoader`

  Inject `LazyModuleLoader` (or resolve `DI_TOKENS.LazyModuleLoader`) to load a module at runtime, NestJS-style:

  ```ts
  const ref = await loader.load(() =>
    import("./reports.module").then((m) => m.ReportsModule)
  );
  ref.get(ReportService);
  ```

  The loaded module's nested `imports` and `providers` are registered into the global container and its `onInitialize` hook runs once. Repeat loads return the cached `ModuleRef`. Controllers, queue consumers, and cron jobs declared by a lazily loaded module are skipped (with a warning) — that wiring is finalized at bootstrap.

  If a lazy module provides a token that another module has already bound on the global container, the existing binding is kept and the colliding lazy provider is ignored (with a warning) — a lazy module cannot silently clobber an already-registered token.

  ### Breaking Changes

  - **Built-in subsystems are no longer registered eagerly at boot.** `I18nModule`, `QueueModule`, `CacheModule`, `OpenAPIModule`, the cron manager, and router services are now loaded via dynamic `import()` at their trigger points (i18n/routing on the first HTTP request, queue on the first batch, cron on the first scheduled invocation or when the app declares jobs). HTTP-only apps no longer evaluate queue/cron code at cold start.
  - **`CacheService` is no longer globally available unless `CacheModule` is loaded.** `RateLimiterModule` now imports `CacheModule` itself; apps that relied on the implicit global `CacheService` must import `CacheModule` (or use `LazyModuleLoader`).
  - **`Application.initializeHandlers()` is removed.** Non-HTTP entrypoints (Durable Objects, Workflows, WorkerEntrypoints) now use `Application.ensureScopedHandlers()` via the internal `runInScope` helper — no action required for typical apps.

- 13b0e8d: Add locale-aware URL generation for path-prefixed and querystring localized routing

  - Route URL generation now applies the active locale automatically — e.g. `uri.route('posts.show', { locale: 'es' })` produces `/es/posts/...` when locale prefixing is enabled.
  - New `LocaleUrlConfig` and a locale-aware URL service for producing locale variants of any URL (used for hreflang alternates, canonical URLs, sitemaps, and redirects).
  - Configurable trailing-slash handling for consistent URL formatting.

- 13b0e8d: Fix correctness and security issues found in review.

  Queue:

  - Retry the correct binding: dispatch stamps the producer binding into message metadata and failed jobs record it, so `queue:retry` re-enqueues through the Cloudflare binding instead of the queue name (which is not a valid binding key and broke retry whenever the two differed). A message with no binding metadata is logged and acked rather than stored as an unretryable job.
  - Honor the documented retry budget: `maxRetries` now counts retries correctly against Cloudflare's 1-based `message.attempts` (previously gave one fewer retry than configured).
  - Derive idempotency keys from an order-stable serialization of `type` + `payload`, so payloads that differ only in key order dedupe correctly.
  - `queue:retry --all` / `queue:purge --all --queue` collect matching keys before deleting, so cursor pagination no longer skips jobs; `queue:failed --queue --limit` now counts matching jobs rather than scanned keys.
  - Documented that delivery is at-least-once with best-effort de-duplication (not exactly-once), since the processed marker is written only after a handler succeeds and KV is eventually consistent — handlers must be idempotent.

  Email (SMTP):

  - Upgrade STARTTLS onto the socket `startTls()` returns: the original socket is closed by the runtime, so the post-upgrade reader/writer are re-derived from the new secure socket and any pre-handshake bytes are discarded (fixes a broken `smtp://` STARTTLS path on real Workers and closes the STARTTLS plaintext-injection vector).
  - Refuse to send credentials over an unencrypted connection: an `smtp://` server that doesn't offer STARTTLS now fails loudly instead of leaking the password (blocks STARTTLS-stripping downgrades). Credential-free connections (e.g. local Mailpit) are unaffected.
  - AUTH is gated on the server's advertised mechanisms and supports both `PLAIN` and `LOGIN`; usernames are percent-decoded like passwords.
  - Add a response timeout so a hung SMTP server can't wedge the worker; QUIT/socket close are now best-effort and never mask a successful send.
  - MIME builder strips CR/LF from headers, escapes/RFC 2231-encodes attachment filenames (prevents header injection), base64-encodes message bodies (fixes long-line corruption), and rejects envelope addresses containing whitespace or angle brackets (prevents `MAIL FROM`/`RCPT TO` desync).

  Inertia SEO:

  - `titleTemplate` substitutes every `%s` and treats `$`-sequences in the title literally.
  - Inject head/body content via function replacements, so SEO/page content containing `$`-sequences (`$$`, `$&`, `` $` ``, `$'`) is no longer corrupted or able to splice a template placeholder back into the output.
  - Drop unsafe attribute names — including inline event handlers (`on*`) — from custom `meta`/`link` entries (prevents tag breakout server-side, `setAttribute` errors during client head-sync, and developer-supplied event-handler attributes).

  Feature flags:

  - `FeatureFlagService.use()` binds the target app exactly once.

  Database (framework):

  - The reentrant `$transaction` proxy forwards the receiver for non-transaction property access.

  Testing:

  - `TestingModule.close()` drops the isolated per-file database even if shutdown throws; the stale-database sweep escapes LIKE metacharacters so a prefix containing `_` can't over-match.

  DI:

  - Construct singletons against the root container so they can never capture a request-scoped dependency (which would leak one request's state across every later request); an illegal singleton→request dependency now throws loudly.
  - Detect circular dependencies and throw a clear error naming the cycle instead of overflowing the stack.
  - `tryResolve` only swallows "no provider"; a registered provider that throws while constructing now surfaces the real error instead of injecting `undefined`.
  - Request-cache invalidation tracks transitive constructor dependencies, so re-registering a value rebuilds cached services that depend on it through a transient intermediary.

  Quarry dev runtime:

  - Persist every durable plugin (KV, D1, R2, Durable Objects, cache) under `.wrangler/state/v3`, matching `wrangler dev` (previously only R2 was persisted); load `.env.local` / `.env.<env>.local` into `process.env` for full parity.
  - The `cloudflare:sockets` STARTTLS shim re-attaches the stream error handler to the upgraded socket, so post-upgrade connection errors still surface.

- 13b0e8d: Align the Quarry CLI dev runtime with `wrangler dev`

  The Quarry CLI now builds its local environment directly from your Wrangler config via Miniflare, so bindings, `vars`, and `.dev.vars` / `.env` files resolve exactly as they do under `wrangler dev` (including environment-specific `.env.<environment>` files loaded by `--env`).

  - **Shared R2 state** — R2 buckets now persist to `.wrangler/state/v3/r2`, so data written by Quarry commands and `wrangler dev` is shared.
  - **Parallel dev environments** — set `WRANGLER_REGISTRY_PATH` to isolate the dev service registry, allowing multiple dev environments to run side by side without service-binding collisions. Quarry also discovers a running `wrangler dev` session so service bindings resolve against it.
  - **SMTP/socket support** — outbound TCP/TLS (e.g. sending email over SMTP) now works when running under Quarry.
  - **Queues and events in commands** — CLI commands can now dispatch to queues and emit events, with listeners wired automatically.

- 13b0e8d: Add failed-job storage, idempotent dispatch, and queue management CLI commands

  - Messages that exhaust their retry attempts are persisted to a KV-backed store so they can be inspected and replayed.
  - New Quarry commands to manage failed jobs:
    - `queue:failed` — list failed jobs (filter with `--queue`, cap with `--limit`).
    - `queue:retry` — re-dispatch a job by id, a whole queue (`--queue`), or everything (`--all`).
    - `queue:purge` — delete a failed job by id, a whole queue (`--queue`), or everything (`--all`).
  - Messages stay auto-idempotent: every dispatch carries an idempotency key (an explicit `metadata.idempotencyKey`, otherwise a deterministic SHA-256 hash of `type` + `payload`), and an already-processed message is skipped. `idempotency.ttl` bounds how long processed keys are remembered (default 24h).
  - Failed jobs persist indefinitely until retried or purged. Register the opt-in `FailedJobCleanupJob` cron (in a module's `jobs` array) to delete failed jobs older than `failedJobs.retention` (default 7 days); use `failedJobCleanupJob(schedule)` for a custom schedule.
  - The KV store binding is validated at app boot: a missing binding throws a clear, actionable `QueueError` during module initialization instead of failing on every queue invocation.
  - Queue state (idempotency claims and failed jobs) is stored in a KV namespace that defaults to the `CACHE` binding; override it with `store: { binding: 'YOUR_KV' }` in the queue module options.

- 13b0e8d: Add precognition request validation, a safe WebSocket send, and cron misconfiguration warnings

  - **Precognition** — send a `Precognition: true` header to run a route's validators (across all parameters, including localized/prefixed routes) and get a `204` without executing the handler, enabling live form validation.
  - **`trySend()`** — gateways can now send a WebSocket message only when the socket is open, returning `false` instead of throwing for closed connections.
  - A warning is now logged when a cron job is registered without a `schedule`, instead of silently skipping it.

- 13b0e8d: Add an opt-in isolate-local L1 cache tier and back queue idempotency with it.

  - New `TieredCacheService` (`CACHE_TOKENS.TieredCacheService`) layers an isolate-local in-memory L1 over `CacheService` (KV). It gives read-after-write coherence within an isolate, closing KV's eventual-consistency gap (a `get` can otherwise return an edge-cached value for up to ~60s after a `put`). Same API as `CacheService` plus `binding(name)`, which memoizes a tiered instance per binding so each KV namespace keeps a stable, isolate-lifetime L1.
  - L1 semantics: caches string-backed values only (`text`/`json`); `put`/`delete` are write-through; `text` reads back-populate; `arrayBuffer`/`stream` reads and non-string writes bypass and invalidate L1; `getWithMetadata`/`list` always read KV. FIFO-bounded.
  - Queue idempotency claims and failed-job storage (`QueueStore`) now run through `TieredCacheService`, so a message redelivered to the same warm isolate is de-duplicated even inside KV's consistency window. Delivery remains at-least-once with best-effort de-duplication, not exactly-once. `QueueModule` now imports `CacheModule`.
  - `CacheService` stays a thin KV wrapper (eventually consistent) and gains a `binding(name)` helper plus a `namespace` getter. Use it — not the tiered cache — for read-modify-write counters that need cross-edge freshness (e.g. rate limiting), where an isolate-local L1 would read its own stale value and miss other isolates' writes.

- be813bc: Update bundled runtime dependencies to their latest patch releases (Hono, `@swc/core`, `@swc/helpers`)

## 0.0.22

### Patch Changes

- 1658945: Overhaul error handling, rename queue "name" to "binding", add i18n CLI commands, and introduce QuarryRunner

  ### Breaking Changes

  - **`ApplicationError`** — Constructor changed from `(i18nKey, code, metadata?)` to `(message?, cause?)`. Remove error code and i18n key arguments from any subclass `super()` calls. The `code`, `metadata`, `toErrorResponse()`, `toJSON()`, `report()`, and `render()` members are removed.
  - **Error codes removed** — `ERROR_CODES` registry and `ErrorCode` type are deleted. Use plain error messages or custom properties on `HttpException` subclasses instead.
  - **Per-module error consolidation** — Individual error classes (e.g. `QueueBindingNotFoundError`, `CacheGetError`, `ConfigModuleNotInitializedError`) are replaced by single per-module error classes (`QueueError`, `CacheError`, `ConfigError`, etc.). Update any `catch` blocks or `instanceof` checks.
  - **Queue "name" → "binding"** — `@InjectQueue('queue-name')` now takes the exact Cloudflare binding key (e.g. `BACKGROUND_QUEUE`) instead of a kebab-case name. The automatic `kebab-case → UPPER_SNAKE_CASE` conversion is removed. Rename all queue references to match your `wrangler.jsonc` binding names.
  - **`withI18n` renamed to `withZodI18n`** — Update imports from `stratal/i18n` accordingly.
  - **Logger transport system removed** — `ConsoleTransport`, `BaseTransport`, and the transport plugin interface are deleted. The logger now writes directly to console.
  - **`ExceptionHandler` simplified** — The handler no longer translates i18n message keys or builds `ErrorResponse` objects. It renders errors using `HttpException.status` and plain messages.

- 4b273ea: Replace tsyringe and reflect-metadata with a built-in dependency injection container and switch i18n engine from @intlify/core-base to intl-messageformat

  ### Breaking Changes

  - **`tsyringe` and `reflect-metadata` removed** — All imports from `tsyringe` (`inject`, `injectable`, `container`, `delay`, `Lifecycle`) must be replaced with equivalents from `stratal/di`. Remove `reflect-metadata` from your dependencies and imports.
  - **`@Transient` decorator renamed to `@Request`** — Update all `@Transient(TOKEN)` usages to `@Request(TOKEN)` for request-scoped services.
  - **`delay()` replaced by `lazy()`** — Replace `delay(() => MyClass)` with `lazy(() => MyClass)` from `stratal/di`.
  - **`scope` removed from module providers** — The `scope` option on `ClassProvider` is removed. Scope is now determined by the class decorator (`@Singleton`, `@Request`). Remove `scope: Scope.Singleton` or `scope: Scope.Request` from provider definitions.
  - **`Scope` enum simplified** — `Scope.Singleton`, `Scope.Request`, and `Scope.Transient` are still available as types, but are no longer passed to module providers. Use `@Singleton()` or `@Request()` decorators on the class instead.
  - **`@intlify/core-base` replaced by `intl-messageformat`** — If you extended `MessageLoaderService` or used `getCoreContext()`, switch to the new `translate(locale, key, params?)` method. The public `I18nService.t()` API is unchanged.
  - **`setupI18nCompiler()` removed** — No manual compiler setup is needed. Remove any calls to this function.
  - **OpenAPI Swagger UI is now dynamically imported** — No action required; reduces initial bundle size.

## 0.0.21

### Patch Changes

- 3489cfd: Warn when a scheduled cron trigger doesn't match any registered job

  `CronManager` now logs a warning (with the incoming cron expression and the list of registered schedules) when Cloudflare invokes a `scheduled()` trigger that no `@Cron` job is registered for. Previously the call returned silently, making misconfigured cron triggers in `wrangler.toml` invisible.

- 3489cfd: Match locale-prefixed routes ahead of their primary so catch-alls don't swallow the locale segment

  Routes registered with `Router.locales(...)` previously sorted **after** their primary, so a request like `/sw/applications/123` against a primary catch-all (`/:slug{.+}`) was matched as `slug='sw/applications/123'` instead of `locale='sw' + slug='applications/123'`. Locale variants now sort just ahead of their primary using the path-with-locale-stripped score plus their extra segment count as the tie-breaker, restoring the expected priority for both static and catch-all routes.

## 0.0.20

### Patch Changes

- f8c61e1: Preserve forward slashes when encoding catch-all path parameters

  URL generation previously percent-encoded `/` inside path-param values, so a value like `'auth/login'` for a catch-all route (`:slug{.+}`) became `'auth%2Flogin'`. Each segment is now encoded individually, so slash-containing values round-trip cleanly while single segments still behave like `encodeURIComponent`.

- f8c61e1: Add stricter `cuid2()` validator as a drop-in for `z.cuid2()`

  Zod's built-in `z.cuid2()` accepts any non-empty lowercase-alphanumeric string, which makes it ineffective as a tenant-id or external-id validator. The new `cuid2()` helper from `stratal/validation` enforces the actual cuid2 shape (24-32 chars, leading letter) while preserving the OpenAPI `format: 'cuid2'` metadata. Custom regex and i18n-aware error messages are supported.

  ```ts
  import { cuid2 } from "stratal/validation";

  z.object({ tenantId: cuid2() });
  z.object({ tenantId: cuid2({ pattern: /^[a-z][0-9a-z]{23}$/ }) });
  ```

  Also exports `CUID2_REGEX` for callers composing the pattern into custom schemas.

- f8c61e1: Add `RateLimiterModule` for request throttling with KV and in-memory stores

  - New opt-in `RateLimiterModule` configurable with `forRoot({ store: 'kv', binding })` or `forRoot({ store: 'memory' })` (or a custom `IRateLimiterStore`).
  - `Limit` builder API with `perSecond`, `perSeconds`, `perMinute`, `perMinutes`, `perHour`, `perDay`, and `none()` helpers; `.by(key)` scopes per-actor and `.response(handler)` overrides the default 429.
  - `RateLimiterRegistry.for(name, resolver)` defines named limiters; apply them with `router.throttle(name)` or the `@RateLimit(name)` decorator on controllers and route methods.
  - `TooManyRequestsError` returns HTTP 429 with `Retry-After` and `X-RateLimit-*` headers automatically; the body honors content negotiation (JSON, HTML, Inertia).
  - Misconfiguration surfaces at boot (missing `forRoot`) rather than on the first throttled request.

- f8c61e1: Add Cloudflare request properties and full-record access on `RouterContext`

  - New `ctx.cf` getter exposes Cloudflare-provided request properties (geo, TLS, bot management, etc.) as `CfProperties`.
  - `ctx.param()` (no args) now returns the full validated param record as `Record<string, string>`. The single-key overload (`ctx.param('id')`) is unchanged. The same overload is available on `GatewayContext` for WebSocket gateways.

- f8c61e1: Add `trailingSlash` application option for canonical URL handling

  A new `trailingSlash` field on `ApplicationConfig` controls how incoming paths and generated URLs handle a trailing `/`:

  - `'ignore'` (default) — both `/foo` and `/foo/` resolve to the same route; URL helpers leave paths unchanged.
  - `'always'` — non-trailing requests are 308-redirected to the trailing-slash form; URL helpers append `/`. Paths whose last segment looks file-like (e.g. `/api/openapi.json`) are skipped.
  - `'never'` — trailing requests are 308-redirected to the non-trailing form; URL helpers strip a single trailing `/`.

  `Uri.to()`, `Uri.url()`, `Uri.current()`, `Uri.full()`, and the global `route()` helper all apply the configured mode. 308 preserves request method and body, and `Location` headers are emitted as path-relative URIs to avoid mixed-content issues behind HTTPS-terminating proxies.

## 0.0.19

### Patch Changes

- 3b16f5b: Resolve cron jobs from request-scoped DI container at execution time

  ### Breaking Changes

  - `CronManager.registerJob()` now accepts `(schedule, jobClass)` instead of a `CronJob` instance. Jobs are resolved from the container at execution time, ensuring request-scoped dependencies (e.g. database connections) are properly scoped.
  - `CronManager.executeScheduled()` now requires a `Container` as its second argument.
  - `CronManager.getJobsForSchedule()` returns `RegisteredJob[]` instead of `CronJob[]`.

- 5d26c24: Rearchitect i18n module augmentation to a per-module keyed registry (breaking change)

  **Why:** Multiple modules augmenting `AppMessages` with a shared top-level parent (e.g., `errors.auth`, `errors.uploads`, `errors.branding`) collided with TypeScript error **TS2717** ("Subsequent property declarations must have the same type"). Interface merging adds new properties across declarations but requires same-named properties to have structurally identical types — it does not deep-merge nested shapes.

  **What changed:**

  - Replaced the single augmentable `AppMessages` interface with an `AppMessageNamespaces` keyed registry. Each module declares its own distinct top-level key (Laravel-style package namespacing). Because each declaration adds a different property, interface merging accepts them all.
  - `AppMessages` is now derived: `{ [K in keyof AppMessageNamespaces]: AppMessageNamespaces[K] }`.
  - Access keys are unchanged dot-notation — `i18n.t('auth.errors.invalidCredentials')` — so no custom resolver is needed.

  **Migration:**

  Before:

  ```ts
  declare module "stratal/i18n" {
    interface AppMessages {
      errors: { uploads: { notFound: string } };
    }
  }
  ```

  After:

  ```ts
  declare module "stratal/i18n" {
    interface AppMessageNamespaces {
      uploads: { errors: { notFound: string } };
    }
  }
  ```

  **Framework package moves:**

  - All `errors.auth.*` keys (previously split between `stratal` core and `@stratal/framework`) now live in the auth module as `auth.errors.*`. `errors.auth.org.*` → `auth.org.*`. The `errors.auth.*` namespace has been removed from `stratal`'s core messages.
  - `@stratal/framework`'s `DatabaseModule` now registers its `database.*` validation messages via `I18nModule.registerMessages` (previously the messages file existed but was never wired up).
  - `@stratal/inertia-modal`'s `errors.modal.*` key moved to `modal.errors.*`.

  **Callsite updates required in downstream apps:**

  ```ts
  // Before
  new ApplicationError('errors.auth.invalidCredentials', ...)
  i18n.t('errors.auth.org.organizationNotFound')

  // After
  new ApplicationError('auth.errors.invalidCredentials', ...)
  i18n.t('auth.org.organizationNotFound')
  ```

  No runtime API change: `I18nModule.registerMessages(messages)` keeps its existing signature, and deep-merge behavior is unchanged. Locale-only contributions that override core's built-in `errors.*` / `common.*` / etc. continue to work.

- 3b16f5b: Add `Macroable` base class for dynamic method registration and introduce `ConfigStore` for request-scoped configuration

  - Add `Macroable` class (inspired by Laravel/AdonisJS) that supports `macro()`, `instanceProperty()`, and `getter()` for runtime method registration with full inheritance support.
  - Introduce `ConfigStore` as a singleton source of truth for validated config, making `ConfigService` request-scoped with per-request overrides via `set()` and `reset()`.
  - `ConfigService` now extends `Macroable`, allowing apps to add domain-specific getters and methods.

- 3b16f5b: Improve middleware error handling and defer routing initialization for better performance

  - Add `MiddlewareNextCalledMultipleTimesError` to detect and report when `next()` is called more than once in a middleware.
  - Defer routing and handler initialization until first request for improved cold-start performance.
  - Improve `isApplicationError` type guard with structural fallback for cross-module boundary cases.

- 5d26c24: Prevent `quarry` from breaking a concurrent `wrangler dev` session

  Running a Quarry command while `wrangler dev` was active could overwrite the worker's entry in the local dev registry, causing peer workers to fail service-binding RPC calls (e.g. `couldn't find a local dev session for the X entrypoint`). Quarry now registers its ephemeral miniflare under a unique per-process worker name, leaving the running dev session's registry entry untouched.

- 5d26c24: Fix route path joining to avoid double slashes and handle empty route paths

  Composing a controller base path with an empty `@Route({ path: '' })` or a base path ending in `/` could previously yield URLs with double slashes or a missing trailing route. Empty route paths now resolve to the controller's base path, and trailing slashes on the base path are stripped consistently.

- 3b16f5b: Migrate storage from AWS S3 to Cloudflare R2 for all storage operations

  ### Breaking Changes

  - The `S3StorageProvider` has been removed. All storage operations now use the native Cloudflare R2 API via `R2StorageProvider`.
  - Storage configuration no longer requires AWS credentials or S3 endpoint settings. Instead, configure an R2 bucket binding in your `wrangler.toml` and reference it in your storage config.
  - Presigned URLs now require the `APP_SECRET` environment variable instead of AWS credentials.
  - The `StorageProviderNotSupportedError` has been replaced with `R2BindingNotFoundError` and `R2PresignedUrlSecretMissingError`.

  ### Migration

  1. Replace any `S3StorageProvider` references with `R2StorageProvider`.
  2. Update your `wrangler.toml` to bind your R2 bucket.
  3. Set `APP_SECRET` in your environment for presigned URL support.
  4. Remove AWS SDK credentials from your environment.

## 0.0.18

### Patch Changes

- fcb71c4: Add stub exports for Cloudflare Workers APIs in the virtual ESM loader used by Quarry CLI
- 17f8675: Add `ExceptionHandler` with customizable error reporting, rendering, and throttling support

  ### Details

  - Introduce `ExceptionHandler` base class with `report()`, `render()`, `shouldReport()`, and `throttle()` hooks
  - Add `HttpException` class for structured HTTP error responses with fluent API
  - Add `ExceptionContext` for collecting contextual metadata during error handling
  - Replace `GlobalErrorHandler` with the new `ExceptionHandler` pipeline
  - Add `stratal` as a CLI bin alias for `quarry`
  - Streamline OpenAPI service and routing metadata handling

  ### Breaking Changes

  - `GlobalErrorHandler` has been removed. Migrate to `ExceptionHandler` by extending the base class and implementing the `render()` hook for custom error responses.

- c9176ea: Enhance i18n locale detection with configurable strategies and message loader service

  ### Details

  - Support multiple locale detection strategies: cookie, header, querystring, and path-based
  - Add `MessageLoaderService` for dynamic message loading and registration
  - Add `stratal/i18n/utils` subpath export for i18n setup utilities

- c9176ea: Add Laravel-style routing with named routes, URI generation, signed URLs, domain routing, and response validation

  ### Details

  - Add `Uri` service for generating URLs from named routes with parameter binding
  - Add signed URL support with HMAC-based signature generation and verification
  - Add domain-based routing with `@Route({ domain })` and domain middleware
  - Add response validation to verify route handler responses match OpenAPI schemas
  - Add `RouteRegistry` for route name lookups and `RouteMap` for serialized route definitions
  - Add `RouterResolver` for programmatic route resolution and middleware chain composition
  - Add `LocalePathService` for locale-aware URL path handling
  - Add `route:types` Quarry command for generating typed route helpers
  - Replace module-level middleware system with router-scoped middleware via `RouteConfigurable`

  ### Breaking Changes

  - The `stratal/middleware` subpath export has been removed. Middleware is now configured through the router using `RouteConfigurable` instead of `MiddlewareConfigurable`. Implement `configureRoutes(router: Router)` on your module and use `router.use(...)` to apply middleware.

## 0.0.17

### Patch Changes

- [#147](https://github.com/strataljs/stratal/pull/147) [`7f2772b`](https://github.com/strataljs/stratal/commit/7f2772ba90a9b6a91603f79293d384e972864125) Thanks [@adesege](https://github.com/adesege)! - Add MCP server support and API CLI commands

  ### Details

  - Add `mcp:serve` command to start a stdio MCP server that exposes OpenAPI routes as tools
  - Add `mcp:tools` command to list available MCP tools derived from the OpenAPI spec
  - Add `api` command to invoke API endpoints directly from the CLI
  - Add `OpenApiToolsService` for converting OpenAPI specs into tool definitions, reusable across MCP, CLI, and custom tooling

- [`6cccfef`](https://github.com/strataljs/stratal/commit/6cccfefdde703c5c6eaba199d05307ab9fe36085) Thanks [@adesege](https://github.com/adesege)! - Add `stratal/storage/providers` sub-path export for direct access to storage provider implementations

- [#145](https://github.com/strataljs/stratal/pull/145) [`79e05de`](https://github.com/strataljs/stratal/commit/79e05de7482c925323a2f37a00e47929133a979f) Thanks [@adesege](https://github.com/adesege)! - Enhance Quarry CLI with dynamic command generation, improved help output, and usage generator

  ### Details

  - Replace static `ListCommand` with dynamic command generation via `createDynamicCommands` that auto-registers user-defined commands with Clipanion
  - Improve `HelpCommand` to display detailed usage for specific commands including arguments, options, and aliases
  - Add `UsageGenerator` for rendering formatted command usage with ANSI colors (name, description, arguments, options sections)
  - Add `colors` utility module for ANSI terminal color output
  - Add `QuarryRegistry.list()` method to retrieve all registered command entries
  - Add comprehensive tests for dynamic commands, help command, and usage generator

- [`3c89c14`](https://github.com/strataljs/stratal/commit/3c89c147fca366382c0771bb442f29a6fc73601e) Thanks [@adesege](https://github.com/adesege)! - Fix module registry to prevent duplicate command registration and exclude internal module property from dynamic module providers

- [`916fd90`](https://github.com/strataljs/stratal/commit/916fd90727a06b5ce7c0397467fe9dc1f859f841) Thanks [@adesege](https://github.com/adesege)! - Add `I18nModule.registerMessages()` for decentralized i18n message registration

  ### Details

  - Any module can now call `I18nModule.registerMessages()` to contribute translations, enabling package-level message ownership
  - Messages are deep-merged across all registrations in order — later calls override earlier ones at leaf level
  - `RouterContext.json()` now accepts `null` and automatically returns 204 No Content

  ### Breaking Changes

  - Remove `messages` option from `I18nModule.forRoot()` — use `I18nModule.registerMessages()` instead

    **Before:**

    ```typescript
    I18nModule.forRoot({
      defaultLocale: 'en',
      messages: { en: { ... }, fr: { ... } },
    })
    ```

    **After:**

    ```typescript
    I18nModule.forRoot({ defaultLocale: 'en' }),
    I18nModule.registerMessages({ en: { ... }, fr: { ... } }),
    ```

- [`cbfce8b`](https://github.com/strataljs/stratal/commit/cbfce8b3a3517b60d94f500c5dc1ef68d8ee76f4) Thanks [@adesege](https://github.com/adesege)! - Support multiple seeder names in `db:seed` command via variadic `{names*}` argument

  ### Details

  - Change `db:seed {name?}` to `db:seed {names*}` to accept multiple seeder class names in a single invocation
  - When `--all` is used with named seeders, warn and ignore the names
  - Iterate over all provided names, running each seeder sequentially

## 0.0.16

### Patch Changes

- [#144](https://github.com/strataljs/stratal/pull/144) [`3dd0bc8`](https://github.com/strataljs/stratal/commit/3dd0bc84c8638db30db7b70f3532a44aa187ace8) Thanks [@adesege](https://github.com/adesege)! - Enhance Quarry CLI with dynamic command generation, improved help output, and usage generator

  ### Details

  - Replace static `ListCommand` with dynamic command generation via `createDynamicCommands` that auto-registers user-defined commands with Clipanion
  - Improve `HelpCommand` to display detailed usage for specific commands including arguments, options, and aliases
  - Add `UsageGenerator` for rendering formatted command usage with ANSI colors (name, description, arguments, options sections)
  - Add `colors` utility module for ANSI terminal color output
  - Add `QuarryRegistry.list()` method to retrieve all registered command entries
  - Add comprehensive tests for dynamic commands, help command, and usage generator

- [#142](https://github.com/strataljs/stratal/pull/142) [`4b958e2`](https://github.com/strataljs/stratal/commit/4b958e250c99681a99a34a398fbf706546f556cc) Thanks [@adesege](https://github.com/adesege)! - Lazy-load S3 storage provider and enhance StorageManagerService with promise deduplication

  ### Details

  - `StorageManager.getProvider()` is now async and dynamically imports `S3StorageProvider` to avoid loading AWS SDK at module evaluation time
  - Add promise deduplication to prevent concurrent `getProvider` calls from creating multiple provider instances
  - Register `StorageManager` as a singleton to share cached providers across requests
  - Move `reflect-metadata` from hard dependency to optional peer dependency
  - Remove `@tus/server` peer dependency
  - Remove direct exports of `S3StorageProvider` and S3 multipart types from the storage barrel — use dynamic import instead

## 0.0.15

### Patch Changes

- [#125](https://github.com/strataljs/stratal/pull/125) [`0731e99`](https://github.com/strataljs/stratal/commit/0731e99c3e0c96f988387611f0ef8559b63d7bd8) Thanks [@adesege](https://github.com/adesege)! - Introduce Quarry command framework with auto-discovery and Clipanion-based CLI

  ### Details

  - Add `Command` base class with declarative signature parsing (arguments, options, flags)
  - Add `QuarryRegistry` for command registration, discovery from modules, and execution
  - Add `quarry` CLI bin (`npx quarry`) with Clipanion-based command routing
  - Add virtual `cloudflare:workers` ESM loader hook for Node compatibility
  - Built-in commands: `list`, `help <command>`, and dynamic command dispatch
  - Auto-discover commands from module `providers` via `isCommand()` utility
  - Support usage/help generation with `UsageGenerator`
  - Custom error types: `CommandError`, `CommandNotFoundError`
  - New sub-path export `stratal/quarry`
  - New dependencies: `clipanion`, `@swc-node/register`

- [#134](https://github.com/strataljs/stratal/pull/134) [`52f1daa`](https://github.com/strataljs/stratal/commit/52f1daa981f5a38b983bb3c14abfefb663eb6941) Thanks [@adesege](https://github.com/adesege)! - Move seeders from standalone `@stratal/seeders` package into core as `stratal/seeder`

  ### Details

  - Add `Seeder` abstract base class with `run()` and `call(OtherSeeder)` methods
  - Add `SeederRegistry` for seeder registration and execution
  - Auto-discover seeders from module `providers` (any class extending `Seeder`)
  - Add built-in Quarry commands: `db:seed {name?} {--all}`, `db:seed:list`
  - Seeders execute within request-scoped DI containers with full access to injected services
  - Use DI-resolved seeders instead of manual instantiation
  - Route unexpected command errors through `GlobalErrorHandler`
  - Remove standalone `packages/seeders` package — all seeder functionality now lives in core
  - New sub-path export: `stratal/seeder`

## 0.0.14

### Patch Changes

- [#124](https://github.com/strataljs/stratal/pull/124) [`59251d3`](https://github.com/strataljs/stratal/commit/59251d32743cbd461f952985f192a68cb7ccdb91) Thanks [@adesege](https://github.com/adesege)! - Export `instancePerContainerCachingFactory` from tsyringe via `stratal/di`

- [#122](https://github.com/strataljs/stratal/pull/122) [`47530bd`](https://github.com/strataljs/stratal/commit/47530bd31bc91329788b4ba7b03a389f0e722f46) Thanks [@adesege](https://github.com/adesege)! - Migrate build system from tsc to tsdown for faster builds and code-splitting support

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
