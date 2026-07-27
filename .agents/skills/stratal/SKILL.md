---
name: stratal
description: "Build Cloudflare Workers applications with the Stratal framework. Use when code imports from 'stratal', '@stratal/framework', '@stratal/testing', '@stratal/inertia', '@stratal/inertia-modal', or '@stratal/feature-flags', when creating modules, controllers, services, routes, queue consumers, cron jobs, seeders, gateways, Durable Objects, Workflows, or CLI commands, or when user mentions Stratal, asks to 'create a module', 'add an endpoint', 'set up auth', 'configure database', 'set up Inertia', 'add SEO', 'add a modal route', 'add a WebSocket gateway', 'use Durable Objects', 'configure storage', 'add feature flags', 'cache this endpoint', 'purge the cache', 'write tests', or 'run quarry'. Covers DI, routing with OpenAPI, error handling, i18n, testing, auth, RBAC, Inertia.js SSR, backend-driven modals, WebSocket gateways, Durable Object / Workflow / RPC base classes, R2 storage, response caching, feature flags, and MCP server. Do NOT use for generic Hono apps, plain Cloudflare Workers, or NestJS."
license: MIT
compatibility: Designed for AI Agents. Requires Node.js 22+, npm.
metadata:
  author: Temitayo Fadojutimi
  version: "2.12"
---

# Stratal Framework

Stratal is a modular Cloudflare Workers framework. ESM-only. Packages:
- `stratal` — core (modules, DI, routing, queues, cron, events, seeders, storage, response caching, websocket, workers, CLI)
- `@stratal/framework` — auth (Better Auth), database (ZenStack), access control, guards
- `@stratal/testing` — test utilities, mocks, HTTP client
- `@stratal/inertia` — Inertia.js server adapter for React SSR
- `@stratal/inertia-modal` — backend-driven modal pages for Inertia
- `@stratal/feature-flags` — Cloudflare Flagship feature flags + Inertia sharing + React hooks

## Critical Rules

Breaking any of these causes runtime failures.

1. **Every injectable class MUST have a scope decorator** — Use `@Singleton()`, `@Request()`, or `@Transient()` from `stratal/di`. Without it, DI fails. `@Controller()` applies it automatically; services, repositories, listeners, seeders, and commands all need it explicitly.

2. **Build schemas with `zod/mini` named imports** — Import builders and checks directly: `import { object, string, array, minLength } from 'zod/mini'`. Apply constraints with `.check(...)` — `string().check(minLength(5))`, `number().check(int(), maximum(100))`. For OpenAPI metadata use `named(schema, 'Id')` (reusable component) and `describe(schema, 'text')` (field docs); for translated validation messages pass `withZodI18n('key', params)` to a check — all from `stratal/validation`.

3. **Use `cuid2` from `stratal/validation`, NOT `zod/mini`'s `cuid2()`** — `zod/mini`'s `cuid2()` regex is `/^[0-9a-z]+$/` and accepts any non-empty lowercase-alphanumeric string (`'sw'`, `'a'`, `'0'`). Stratal's `cuid2()` enforces real cuid2 shape and keeps `format: cuid2` in the OpenAPI spec.

4. **Import DI utilities from `stratal/di`** — Use `import { inject, Singleton, Request } from 'stratal/di'`.

5. **`experimentalDecorators` and `emitDecoratorMetadata` must be `true`** in tsconfig.

7. **Convention routing and explicit HTTP decorators cannot mix** — Per controller, use EITHER convention-based (`@Route()` / `@InertiaRoute()` + method names `index/show/create/update/patch/destroy`) OR explicit (`@Get()/@Post()` / `@InertiaGet()/@InertiaPost()`). Never both. You CAN mix regular decorators (`@Get`) with Inertia explicit decorators (`@InertiaGet`) in the same controller.

8. **ESM-only** — `"type": "module"` in package.json.

9. **DI tokens** — Use class-as-token for simple cases. Use `Symbol.for()` for shareable modules, value providers, factory providers. Group symbols in a `tokens.ts` file.

10. **Cron schedules must match `wrangler.jsonc`** — Declare `static schedule` on the class. The string must exactly match a trigger in `[triggers]`.

11. **I18nModule must be configured for translations** — `I18nModule.forRoot()` for locale config with `detection` option (`'cookie'` default, `'header'`, `'querystring'`, `'path'`). Path detection supports `prefixDefaultLocale` (`false` default, `'redirect'`, `true`). `I18nModule.registerMessages()` to add messages. `I18nService.t()` for translation. `withZodI18n()` (from `stratal/validation`) for Zod validation messages. `withI18n()` (from `stratal/i18n`) for general translations.

12. **Custom ExceptionHandler must extend `ExceptionHandler`** — Import from `stratal/errors`, implement `register()`, pass to `new Stratal({ exceptionHandler: AppExceptionHandler })`.

13. **Every response carries an explicit `Cache-Control`; caching is opt-in per route** — Responses without `@Cacheable` are stamped `private, no-store`, because Cloudflare Workers Caching applies RFC 9111 heuristic freshness and would otherwise cache a header-less `200` for two hours and a `404` for three minutes. To cache, import `ResponseCacheModule.forRoot()` from `stratal/response-cache` and annotate the route with `@Cacheable({ ttl })`. A response that differs per caller must declare `partitionBy`, which requires the two-entrypoint gateway (`gateway: { entrypoint }` + `cachedEntrypoint(stratal)` from `stratal/workers`); without it, `partitionBy` and guarded routes are rejected at boot rather than sharing one entry between users. See `references/response-cache.md`.

## Quarry CLI

Run `npx quarry help` to see all commands. Always use these to inspect your app before reading code.

| Command | What It Does |
|---------|-------------|
| `npx quarry list` | Show all registered commands |
| `npx quarry help <cmd>` | Show usage for a command |
| `npx quarry route:list` | List all HTTP routes (supports `--method`, `--path`, `--name`, `--hidden` filters) |
| `npx quarry route:types` | Generate TypeScript types for named routes |
| `npx quarry event:list` | List all event listeners |
| `npx quarry schedule:list` | List all cron schedules |
| `npx quarry queue:list` | List all queue consumers |
| `npx quarry queue:failed` | List failed queue jobs |
| `npx quarry queue:retry` | Retry failed queue jobs (single or all) |
| `npx quarry queue:purge` | Delete failed queue jobs without retrying |
| `npx quarry db:seed:list` | List all seeders |
| `npx quarry mcp:tools` | Preview MCP tools from your API |
| `npx quarry mcp:serve` | Start MCP stdio server exposing routes as tools |
| `npx quarry api` | Serve the OpenAPI spec |
| `npx quarry i18n:check` | Audit translations for missing/extra keys (exit code 1 on issues — CI-friendly) |
| `npx quarry i18n:stats` | Show translation coverage % per locale |
| `npx quarry i18n:list` | List all message keys with per-locale coverage |
| `npx quarry i18n:search` | Search message keys or values by substring |
| `npx quarry i18n:namespaces` | List namespaces with key counts per locale |
| `npx quarry i18n:duplicates` | Find keys with duplicate translation values |

For full CLI reference including custom command creation, see `references/quarry-cli.md`.

## Entry Points

### Worker Entry (`src/index.ts`)

```typescript
import { Stratal } from 'stratal'
import { AppModule } from './app.module'

export default new Stratal({ module: AppModule })
```

**Caching a route that differs per caller** adds a second export — the default becomes a gateway (caching off) forwarding partitioned reads to it (caching on). Needs `enable_ctx_exports` plus an `exports` block in `wrangler.jsonc`; see `references/response-cache.md`.

```typescript
import { cachedEntrypoint } from 'stratal/workers'

const stratal = new Stratal({ module: AppModule })
export default stratal
export const Cached = cachedEntrypoint(stratal)
```

Constructor config:
- `module` (required) — Root module class or dynamic module
- `exceptionHandler?` — Custom `ExceptionHandler` subclass
- `logging?` — `{ level?, formatter? }` (`'json'` | `'pretty'`)
- `versioning?` — `{ prefix?, defaultVersion? }`
- `trailingSlash?` — `'ignore'` (default) | `'always'` | `'never'`, or `{ mode, exclude }` to exempt paths (string segment-prefixes or RegExps) whose canonical form is external (e.g. OAuth callbacks). Redirects non-canonical forms with 308 and applies the same canonicalisation to all URL helpers. See `references/routing.md`.

### CLI Entry (`src/quarry.ts`)

Quarry CLI defaults to `src/quarry.ts`. Use `QuarryRunner`:

```typescript
import { QuarryRunner } from 'stratal/quarry/runner'
import { AppModule } from './app.module'

export default QuarryRunner.run({
  imports: [AppModule],
  providers: [/* seeders, CLI-only services */],
})
```

`QuarryRunner.run()` options:
- `imports` (required) — Modules to register (always include your root module; add CLI-only modules like `InertiaQuarryModule`)
- `providers?` — CLI-only classes (seeders, services)
- `exceptionHandler?` — Custom exception handler for CLI runs

## Module System

```typescript
import { Module } from 'stratal/module'

@Module({
  imports: [OtherModule],
  providers: [MyService, MyRepo],   // Services, listeners, seeders, commands
  controllers: [MyController],
  consumers: [MyConsumer],          // Queue consumers
  jobs: [MyJob],                    // Cron jobs
})
export class MyModule {}
```

Dynamic modules use `forRoot()` / `forRootAsync()` — see `references/modules-and-di.md`.

## Controllers and Routing

Two patterns, never mixed in one controller:

- **Convention-Based (REST Resources)** — method names map automatically: `index` -> GET, `show` -> GET /:id, `create` -> POST, `update` -> PUT /:id, `patch` -> PATCH /:id, `destroy` -> DELETE /:id. Decorate with `@Route()` from `stratal/router`.
- **Explicit Decorators** — `@Get()/@Post()/@Put()/@Patch()/@Delete()/@All()` from `stratal/router` when convention names don't fit.

Routes can be named for URL generation. Convention routes auto-name (e.g., `notes.index`, `notes.show`). Use `name` in `@Controller()` for prefix, `name` in `@Route()`/`@Get()` for explicit names. Generate URLs with `ctx.route('notes.show', { id: '1' })` in controllers or `route('notes.show', { id: '1' })` from `stratal/router` outside controllers. Run `npx quarry route:types` for type-safe route names.

For full routing reference (`@Controller()` options, code examples for both patterns, RouteConfig, RouterContext, named routes, URL generation, signed URLs, domain routing, Router fluent API, OpenAPI), see `references/routing.md`.

## File Conventions

### Directory Structure

```
src/
  index.ts                    # Worker entry point
  quarry.ts                   # CLI entry point (QuarryRunner)
  app.module.ts               # Root module
  types/
    env.ts                    # StratalEnv augmentation
  domain/
    notes/
      notes.module.ts
      notes.controller.ts
      notes.service.ts
      schemas/
        note.schema.ts
      __tests__/
        notes.controller.spec.ts
```

### StratalEnv Augmentation

Every Stratal app must declare this so the framework knows the Cloudflare env shape:

```typescript
// src/types/env.ts
declare module 'stratal' {
  interface StratalEnv extends Cloudflare.Env {}
}
```

Run `wrangler types` to generate `Cloudflare.Env` from your `wrangler.jsonc` bindings.

### Sub-Path Imports

Core: `stratal`, `stratal/cache`, `stratal/config`, `stratal/cron`, `stratal/di`, `stratal/email`, `stratal/errors`, `stratal/events`, `stratal/guards`, `stratal/i18n`, `stratal/i18n/messages/en`, `stratal/i18n/utils`, `stratal/logger`, `stratal/module`, `stratal/openapi`, `stratal/quarry`, `stratal/quarry/runner` (CLI-only: `QuarryRunner`, built-in commands), `stratal/queue`, `stratal/rate-limiter`, `stratal/response-cache`, `stratal/router`, `stratal/seeder`, `stratal/storage`, `stratal/storage/providers`, `stratal/validation`, `stratal/websocket`, `stratal/workers`

Framework: `@stratal/framework/access-control`, `@stratal/framework/auth`, `@stratal/framework/context`, `@stratal/framework/database`, `@stratal/framework/factory`, `@stratal/framework/guards`

Testing: `@stratal/testing`, `@stratal/testing/mocks`, `@stratal/testing/mocks/zenstack-language`, `@stratal/testing/storage`, `@stratal/testing/vitest-plugin`

Inertia: `@stratal/inertia`, `@stratal/inertia/quarry` (CLI-only: `InertiaQuarryModule`, build/dev/types/install commands), `@stratal/inertia/react`, `@stratal/inertia/testing`, `@stratal/inertia/vite`, `@stratal/inertia-modal`, `@stratal/inertia-modal/react`

## Workflows

### Create a New Feature Module

1. Create feature directory: `src/domain/notes/`
2. Create tokens file `notes.tokens.ts` with Symbol-based tokens (if needed)
3. Create service `notes.service.ts` with `@Transient()`
4. Create controller `notes.controller.ts` with `@Controller('/api/v1/notes')`
5. Create module `notes.module.ts` with `@Module({ providers: [NotesService], controllers: [NotesController] })`
6. Add `NotesModule` to root module's `imports`
7. (Optional) Implement `RouteConfigurable` in module for middleware, route prefixes, or grouping
8. Run `npx quarry route:list` to verify routes are registered

### Add CRUD Endpoints

1. Define schemas in `schemas/` with `zod/mini` builders — wrap each reusable one in `named(schema, 'SchemaName')` from `stratal/validation`
2. Create controller with `@Controller('/api/v1/resource', { tags: ['Resource'] })`
3. Implement convention methods: `index`, `show`, `create`, `update`, `destroy`
4. Add `@Route()` with `body`, `params`, `query`, `response` on each method
5. Run `npx quarry route:list` to verify

### Add Custom Error Handling

1. Create `src/exceptions/app-exception-handler.ts` extending `ExceptionHandler`
2. Implement `register()` with `reportable()`, `renderable()`, `dontReport()` as needed
3. Pass to entry point: `new Stratal({ module: AppModule, exceptionHandler: AppExceptionHandler })`
4. Create custom error classes: extend `ApplicationError` for 500 errors, extend `HttpException` for non-500 errors with baked-in status

### Set Up Inertia.js SSR

Install `@stratal/inertia`, configure `InertiaModule.forRoot({ rootView, ssr: { bundle } })`, wire `InertiaQuarryModule` into `src/quarry.ts`, use `@InertiaGet`/`ctx.inertia()`, then `npx quarry inertia:dev`. Full 8-step setup (incl. flash messages, frontend i18n, SEO, hreflang) in `references/inertia.md`.

### Set Up Backend Modals

Install `@stratal/inertia-modal`, add `ModalModule`, return `ctx.inertiaModal('Page/Component', props, { baseURL })` from a controller, wire the frontend `resolver` in `src/inertia/app.tsx`, place `<Modal />` in the layout. Full steps in `references/inertia-modal.md`.

### Expose API as MCP Server

`npx quarry mcp:serve` (filter with `--tag`/`--path`), preview with `npx quarry mcp:tools`. See `references/quarry-cli.md` for all MCP flags and options.

## Example Interactions

**User says "Create a notes module with CRUD"** -> Create `src/domain/notes/` with module, controller, service, `zod/mini` schemas wrapped in `named()` from `stratal/validation`. Use convention routing. Register in root module. Run `npx quarry route:list` to verify.

**User says "Add authentication"** -> Read `references/auth-and-rbac.md`. Configure `AuthModule.forRootAsync()`. Add `@UseGuards(AuthGuard())` to controllers.

**User says "Write tests for my service"** -> Read `references/testing.md`. Use `Test.createTestingModule()` with provider overrides. Use `module.http` for HTTP tests, `module.get()` for unit tests.

**User says "Run my tests in parallel with isolated databases"** -> Read `references/testing.md` (Setup) — opt-in per-file DB isolation via `database: {}` on `stratalTest()`, `createTestDatabaseGlobalSetup()`, `prepare`, `truncateDb()`.

**User says "Set up the database"** -> Read `references/database.md`. Configure `DatabaseModule.forRootAsync()` with ZenStack.

**User says "Add custom error handling"** -> Read `references/errors-and-i18n.md`. Create `ExceptionHandler` subclass, implement `register()`, pass to `Stratal` constructor.

**User says "Customize the 404 page" / "Custom error pages"** -> Read `references/errors-and-i18n.md` (and `references/inertia.md` if using Inertia). For Inertia apps, ship `pages/Errors/${status}.tsx` — `InertiaModule` auto-renders them. Otherwise use `this.errorPage(cb)` inside `AppExceptionHandler.register()`, or override `protected renderDefaultHtml()` for a static branded fallback.

**User says "Set up Inertia.js"** -> Read `references/inertia.md`. Install `@stratal/inertia`, configure `InertiaModule.forRoot()`, use `@InertiaRoute()` + `ctx.inertia()`.

**User says "Don't server-render the admin pages" / "Exclude a page from SSR" / "Client-only page" / "Shrink the SSR bundle"** -> Read `references/inertia.md`. Add the page-component-name globs to `ssrExclude` in the `stratalInertia()` Vite plugin (e.g. `ssrExclude: ['Admin/**', 'Reports/Heavy']`) — matched pages and their deps are dropped from the SSR/worker bundle and render client-only.

**User says "Add a modal route" / "Open a modal page"** -> Read `references/inertia-modal.md`. Install `@stratal/inertia-modal`, add `ModalModule`, use `ctx.inertiaModal('Component', props, { baseURL })` in controllers, place `<Modal />` in the layout.

**User says "Add a WebSocket gateway" / "Real-time endpoint"** -> Read `references/websocket.md`. Use `@Gateway('/ws/path')` + `@OnMessage()/@OnClose()/@OnError()`. Register in module `controllers` array.

**User says "Use Durable Objects" / "Cloudflare Workflows" / "Service binding RPC"** -> Read `references/workers.md`. Extend `StratalDurableObject` / `StratalWorkflow` / `StratalWorkerEntrypoint` and call `this.runInScope(container => …)` to access DI services.

**User says "Configure storage" / "Upload files to R2"** -> Read `references/infrastructure.md` Storage section. Configure `StorageModule.forRoot()` with R2 bindings, use `StorageService` for upload/download/presigned URLs.

**User says "Expose my API as MCP tools"** -> Run `npx quarry mcp:serve`. Use `--tag` or `--path` flags to filter. Preview with `npx quarry mcp:tools`.

**User says "Retry failed queue jobs" / "See failed messages" / "Purge dead letters"** -> Read `references/queues-and-cron.md`. Run `npx quarry queue:failed` to list, `npx quarry queue:retry --all` to retry all, `npx quarry queue:purge --all` to delete all.

**User says "Automatically clean up old failed jobs" / "Expire dead-letter jobs" / "Bound failed-job KV growth"** -> Read `references/queues-and-cron.md` (Failed Job Management) — opt-in `FailedJobCleanupJob`, `QueueModule.forRoot({ failedJobs: { retention } })`, matching cron trigger.

**User says "List all routes" / "Debug my app"** -> Run `npx quarry route:list`. Also try `event:list`, `schedule:list`, `queue:list` to inspect other registrations.

**User says "Set up i18n with Accept-Language header"** -> Read `references/errors-and-i18n.md`. Configure `I18nModule.forRoot({ detection: { strategy: 'header' } })`. Register messages with `I18nModule.registerMessages()`.

**User says "Add hreflang tags" / "Localized SEO" / "Alternate language URLs"** -> Read `references/inertia.md` (Hreflang section) — auto-emitted once Inertia + `I18nModule.forRoot({ locales, defaultLocale, detection: { strategy: 'path' | 'querystring' } })` are configured with ≥2 locales, no extra setup.

**User says "Set the page title/description" / "Add SEO / Open Graph / meta tags" / "Set page metadata"** -> Read `references/inertia.md` (SEO section) — `ctx.seo({ title, description, openGraph, twitter, ... })` in the controller, app-wide `InertiaModule.forRoot({ seo: { defaults, titleTemplate } })`, auto head-sync, `useSeo()` to read it in a component.

**User says "Check if all translations are complete" / "Audit i18n" / "Missing translations"** -> Run `npx quarry i18n:check`. Use `--locale=fr` to check a single locale, `--prefix=common` to filter by namespace. See `references/quarry-cli.md` for all i18n commands.

**User says "Generate URLs for routes"** -> Read `references/routing.md`. Use `ctx.route('name', params)` in controllers. Use standalone `route()` from `stratal/router` outside controllers. Run `npx quarry route:types` for type safety.

**User says "Build URLs in React" / "Active link" / "Get current tenantId from URL"** -> Read `references/inertia.md`. Use `useRoute()` from `@stratal/inertia/react`. `route('users.show', { id })` auto-fills sticky params; `current('users.*')` matches by wildcard; `currentRoute` (discriminated by `name`) gives type-safe `params`.

**User says "Validate a tenant ID / cuid2"** -> Read `references/errors-and-i18n.md`. `import { cuid2 } from 'stratal/validation'` — never `zod/mini`'s `cuid2()`.

**User says "Add domain-based routing"** -> Read `references/routing.md`. Set `domain: '{tenant}.myapp.com'` on `@Controller()` or use `router.domain()` in `configureRoutes()`. Access with `ctx.domain('tenant')`.

**User says "Set up signed URLs"** -> Read `references/routing.md`. Add `APP_SECRET` to `wrangler.jsonc` vars. Use `ctx.signedUrl('route.name', params, { expiresIn: 3600 })`. Verify with `ctx.hasValidSignature()`.

**User says "Configure middleware for routes"** -> Read `references/middleware-and-guards.md`. Implement `RouteConfigurable` in module, use `router.middleware()` for scoped or `router.use()` for global middleware.

**User says "Always trailing slash on URLs" / "Force no trailing slash"** -> Read `references/routing.md`. Set `trailingSlash: 'always'` or `'never'` in the `Stratal` constructor. Default `'ignore'` matches both forms with no redirect.

**User says "Lazily load a module" / "Load a module on demand" / "Reduce cold start"** -> Read `references/modules-and-di.md` (Lazy Module Loading). Inject `DI_TOKENS.LazyModuleLoader`, call `loader.load(() => import('./x.module').then(m => m.XModule))`, resolve providers via `ref.get(Token)`. Lazy modules register providers only — controllers/consumers/jobs are skipped.

**User says "I have an existing Hono app"** -> Read `references/incremental-adoption.md`. Mount Stratal as sub-app via `stratal.hono`.

**User says "Add rate limiting" / "Throttle this endpoint" / "429 too many requests"** -> Read `references/rate-limiter.md`. Import `RateLimiterModule.forRoot({ store: 'kv', binding: 'RATE_LIMITS' })`. Define limiters in `OnInitialize` via `registry.for('name', ctx => Limit.perMinute(60).by(...))`. Attach with `router.throttle('name')` or `@RateLimit('name')`. For better-auth path rules → `references/auth-and-rbac.md` "Rate-limit interop".

**User says "Cache this endpoint" / "Add response caching" / "Cache the blog page" / "Purge the cache after an update"** -> Read `references/response-cache.md` — `ResponseCacheModule.forRoot()`, `@Cacheable({ ttl, tags })` / `@PurgesCache({ tags })`, `"cache": { "enabled": true }` in `wrangler.jsonc`; per-caller caching needs the gateway (`cachedEntrypoint`, `partitionBy`).

**User says "Add feature flags" / "Use Flagship" / "toggle a feature"** -> Read `references/feature-flags.md`. Install `@stratal/feature-flags`, add the `flagship` binding to wrangler, import `FeatureFlagModule.forRoot({ apps: [{ binding: 'FLAGS', flags: {...} }] })`, inject `FeatureFlagService`. To expose flags to Inertia, register `FeatureFlagShareMiddleware` (scoped via `router.middleware(...)` or global via `router.use(...)`) and read them via `useFlag` from `@stratal/feature-flags/react`.

**User says "Only show the edit button to users who can update posts"** -> Read `references/inertia.md` (Access Control). Import `Can` from `@stratal/inertia/react/access` and wrap the button: `<Can do="posts:update"><EditButton /></Can>`. Requires `accessControl` on `AuthModule.forRootAsync()`.

## Reference Loading Guide

Load these when the task needs deeper knowledge:

| Reference | When to Load |
|-----------|-------------|
| `references/quarry-cli.md` | CLI commands, MCP server setup, custom command creation, debugging |
| `references/modules-and-di.md` | Provider types, scopes, container API, dynamic modules, lazy module loading (`LazyModuleLoader`) |
| `references/routing.md` | RouteConfig, RouterContext API, named routes, URL generation, signed URLs, domain routing, Router fluent API, OpenAPI, versioning |
| `references/errors-and-i18n.md` | ExceptionHandler, ApplicationError, HttpException, domain error classes, i18n, withZodI18n(), withI18n() |
| `references/inertia.md` | Inertia.js setup, rendering, props, SSR, SEO (`ctx.seo()`, auto head-sync), type safety, Vite, access control (`Can`/`HasRole` components, `useCan`/`useRole`/`useAccess` hooks) |
| `references/inertia-modal.md` | Backend-driven modal pages: `ModalModule`, `ctx.inertiaModal()`, `<Modal>`, `useModal()` |
| `references/feature-flags.md` | Cloudflare Flagship: `FeatureFlagModule`, `FeatureFlagService`, flag manifest, `use()`, `all()`, `FeatureFlagShareMiddleware` (Inertia sharing), `useFlag`/`useFeatureFlags` |
| `references/websocket.md` | WebSocket gateways: `@Gateway`, `@OnMessage`, `GatewayContext` |
| `references/workers.md` | Durable Objects, Workflows, Service Bindings — DI-aware base classes |
| `references/database.md` | DatabaseModule, ZenStack, connections, plugins, transactions |
| `references/auth-and-rbac.md` | Better Auth, AuthContext, access control, AuthGuard, rate-limit interop (`registry.forPath()` + auto-wired `customStorage` / `customRules`) |
| `references/events.md` | Event listeners, @On/@Listener, database events, wildcards |
| `references/queues-and-cron.md` | Queue consumers, senders, auto-idempotent dispatch, failed job management + `FailedJobCleanupJob` cron, cron jobs, wrangler config |
| `references/seeders.md` | Database seeders, calling other seeders |
| `references/middleware-and-guards.md` | RouteConfigurable, middleware registration with Router, guards, @UseGuards |
| `references/response-cache.md` | Workers Caching: `@Cacheable`, `@PurgesCache`, `ResponseCacheModule.forRoot({ defaults })`, `Cache-Tag` interpolation (`{param/query/data}`), purging, fail-closed rules, per-caller `partitionBy` via the two-entrypoint gateway (`cachedEntrypoint`, `partitions`, `primers`), Inertia SSR caching, Wrangler setup, local-dev limits |
| `references/rate-limiter.md` | Named rate limiters, `RateLimiterModule.forRoot()`, `Limit` value class (incl. `perSeconds`), `router.throttle()`, `@RateLimit` decorator, typed-KV custom stores, 429 headers |
| `references/testing.md` | TestingModule, TestHttpClient, mocks, factories; opt-in per-file database isolation (`database: {}`, `createTestDatabaseGlobalSetup`, `prepare`, `truncateDb`) |
| `references/infrastructure.md` | Cache (KV), Logger, Email (SMTP), Storage (R2 — multi-disk, presigned URLs), OpenAPI |
| `references/config.md` | ConfigService, registerAs(), namespaces |
| `references/incremental-adoption.md` | Mounting Stratal into existing Hono app |
| `assets/project-scaffold.md` | New project template (only when scaffolding from scratch) |

## Troubleshooting

**"No injectable constructor"** -> Missing scope decorator (`@Singleton()`, `@Request()`, or `@Transient()`) on the class.

**"Token not registered"** -> Provider not in any module's `providers`, or module not imported.

**"missing @inject on constructor parameter N" / "has N constructor parameter(s) but none are decorated with @inject"** -> Every constructor dependency needs an explicit `@inject(Token)` from `stratal/di` — there is no type-based auto-resolution. Decorate each parameter.

**"Cannot resolve request-scoped provider ... outside a request scope"** -> A `@Request()`-scoped service was resolved at boot or outside an HTTP request. Resolve it inside a request handler; for non-HTTP entrypoints (Durable Objects, Workflows, WorkerEntrypoints) use `this.runInScope(container => …)` (see `references/workers.md`).

**"Cannot mix convention and HTTP decorators"** -> Pick one routing pattern per controller.

**Validation errors not translated** -> Pass `withZodI18n('key', params)` to the failing check (e.g. `string().check(minLength(5, withZodI18n('validation.minLength', { min: 5 })))`), or register the global `zodErrorMap` from `stratal/validation`.

**`cuid2()` from `zod/mini` accepts `'sw'`, `'a'`, or any short lowercase string** -> Its regex is `/^[0-9a-z]+$/`. Use `cuid2()` from `stratal/validation` instead.

**Cron job not firing** -> `schedule` must be a `static` class property (not instance property). Also verify the string matches `wrangler.jsonc` trigger exactly. Jobs without a static `schedule` property log a warning and are skipped at boot.

**Queue messages not consumed** -> Check: consumer in `consumers` array (not `providers`), `messageTypes` matches dispatched `type`, `QueueModule.registerQueue('BINDING_NAME')` called, and `'BINDING_NAME'` matches the `binding` field under `queues.producers[]` in `wrangler.jsonc` exactly (UPPER_SNAKE_CASE, no transformation).

**ExceptionHandler `register()` not called** -> Did you pass `exceptionHandler` to `new Stratal()`? The handler class must also have `@Transient()`.

**Inertia returns JSON instead of full HTML** -> Missing SSR bundle configuration. Check `ssr.bundle` in `InertiaModule.forRoot()` options.

**`MissingAccessPropsError`** -> `accessControl` is not configured on `AuthModule.forRootAsync()`. Configure it (see `references/auth-and-rbac.md`) — `@stratal/framework` then shares the `access` prop automatically.

**Permission string rejected as a type error** -> The generated types are stale, or the permission isn't defined in `accessControl`. Run `quarry inertia:types` and confirm the resource and action exist in your `accessControl` definition.

**Locale not detected** -> Check `detection` strategy in `I18nModule.forRoot()`. Default is `'cookie'` (reads `locale` cookie). Use `'header'` for `Accept-Language`, `'querystring'` for `?locale=`, `'path'` for URL prefix.

**Routes not showing in `route:list`** -> Controller not in module's `controllers` array, or module not imported in root module.

**"Route name not found"** -> Route not named. Add `name` to `@Route()` or `@Controller()`, or use convention routing which auto-generates names. Run `npx quarry route:list` to see named routes.

**"Duplicate route name"** -> Two routes share the same name. Check `@Controller({ name })` prefixes and `@Route({ name })` values.

**"APP_SECRET environment variable is required"** -> Add `APP_SECRET` to `wrangler.jsonc` `[vars]` for signed URL features.

**"Domain mismatch" / 404 on domain routes** -> Request host doesn't match controller's domain pattern. Check `@Controller({ domain })` or `router.domain()` config.

**Trailing slashes redirect unexpectedly (308)** -> `trailingSlash` is set to `'always'` or `'never'`. Default is `'ignore'`. Root `/` and file-like paths (last segment containing `.`, e.g. `/api/openapi.json`) are excluded from `'always'` redirects.

**`RateLimiterNotConfiguredError` at boot** -> `RateLimiterModule` is imported (directly or via another import) but `forRoot({ store })` was never called. There is no implicit default — pick `'kv'` / `'memory'` / `{ useClass }`.

**`RateLimiterModuleNotImportedError` on first throttled request** -> A route uses `router.throttle('name')` or `@RateLimit('name')` but no module imports `RateLimiterModule.forRoot(...)` in your AppModule's transitive imports. Add it.

**`RateLimiterNotDefinedError` for limiter name** -> `router.throttle('foo')` references a name that's never registered. Call `RateLimiterRegistry.for('foo', ...)` inside a module's `OnInitialize` hook.

**`ResponseCacheConfigError`** -> One of: `ResponseCacheModule` was never imported while a route uses `@Cacheable`/`@PurgesCache`; `"cache": { "enabled": true }` is missing from `wrangler.jsonc` (fails on the **first request**, not at deploy — also needs Wrangler >= 4.69.0 and `compatibility_date` >= `2026-07-06`); the configured `gateway.entrypoint` is not reachable on `ctx.exports` (a typo, a missing `export const`, or a missing `enable_ctx_exports` compatibility flag — fails on the **first request**); or the route config is rejected — `@Cacheable` on a guarded route with no effective `partitionBy`, a `partitionBy`/`partitions`/`primers` without `gateway: { entrypoint }`, a `gateway.entrypoint` of `"default"`, a partition name with no registered resolver, a `{body.*}` cache tag, a missing/non-positive `ttl`, or `purgeEverything` combined with `tags`/`pathPrefixes`. The message names the controller and method.

**`CachePurgeError` / `InvalidCacheTagError`** -> `@PurgesCache` awaits its purge and throws when it fails, so the client sees a `500` for a mutation that **already committed** — treat it as possibly-applied and re-read. Usual cause: the `cache` binding is missing in that environment. `InvalidCacheTagError` means a tag template could not render; on `@Cacheable` it is caught and the response fails closed (not cached), on `@PurgesCache` it fails the request.

**Caching not working / responses are `private, no-store`** -> Miniflare does not implement `ctx.cache`, so real hit/miss behaviour cannot be exercised locally (`wrangler dev`, vitest workers pool) — use `wrangler dev --remote` or a deployed environment; header emission and boot checks *are* locally testable. If the header is `private, no-store` on a `@Cacheable` route, it failed closed: `Set-Cookie` present, non-2xx status, an unrenderable `Cache-Tag`, or (Inertia) flash data, a partial reload, or a `once()` prop.
