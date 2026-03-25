---
name: stratal
description: "Build Cloudflare Workers applications with the Stratal framework. Use when code imports from 'stratal' or '@stratal/*', when creating modules, controllers, services, routes, queue consumers, cron jobs, or CLI commands, or when user mentions Stratal, asks to 'create a module', 'add an endpoint', 'set up auth', 'configure database', 'add error handling', 'set up Inertia', or 'run quarry'. Covers DI, routing with OpenAPI, error handling, i18n, testing, auth, RBAC, Inertia.js SSR, and MCP server. Do NOT use for generic Hono apps, plain Cloudflare Workers, or NestJS."
license: MIT
compatibility: Designed for Claude Code. Requires Node.js 20+, yarn.
metadata:
  author: strataljs
  version: "2.0"
---

# Stratal Framework

Stratal is a modular Cloudflare Workers framework. ESM-only. Three packages:
- `stratal` — core (modules, DI, routing, queues, cron, events, seeders, CLI)
- `@stratal/framework` — auth (Better Auth), database (ZenStack), RBAC (Casbin), guards
- `@stratal/testing` — test utilities, mocks, HTTP client
- `@stratal/inertia` — Inertia.js server adapter for React SSR

## Critical Rules

Breaking any of these causes runtime failures.

1. **Every injectable class MUST have `@Transient()`** — tsyringe requires it. Without it, DI fails. `@Controller()` applies it automatically; services, repositories, listeners, seeders, and commands all need it explicitly.

2. **Import `z` from `stratal/validation`, NOT `zod`** — Stratal wraps Zod with i18n. Direct `zod` imports bypass translation.

3. **Never import from `tsyringe` directly** — Use `import { inject } from 'stratal/di'`. Stratal re-exports everything needed.

4. **`reflect-metadata` must be imported** — `Stratal` class does this automatically. Test setup files must add `import 'reflect-metadata'`.

5. **`experimentalDecorators` and `emitDecoratorMetadata` must be `true`** in tsconfig.

6. **Convention routing and explicit HTTP decorators cannot mix** — Per controller, use EITHER convention-based (`@Route()` / `@InertiaRoute()` + method names `index/show/create/update/patch/destroy`) OR explicit (`@Get()/@Post()` / `@InertiaGet()/@InertiaPost()`). Never both. You CAN mix regular decorators (`@Get`) with Inertia explicit decorators (`@InertiaGet`) in the same controller.

7. **ESM-only** — `"type": "module"` in package.json.

8. **DI tokens** — Use class-as-token for simple cases. Use `Symbol.for()` for shareable modules, value providers, factory providers. Group symbols in a `tokens.ts` file.

9. **Cron schedules must match `wrangler.jsonc`** — `CronJob.schedule` string must exactly match a trigger in `[triggers]`.

10. **I18nModule must be configured for translations** — `I18nModule.forRoot()` for locale config. `I18nModule.registerMessages()` to add messages. `I18nService.t()` for translation. `withI18n()` for Zod validation messages.

11. **Custom ExceptionHandler must extend `ExceptionHandler`** — Import from `stratal/errors`, implement `register()`, pass to `new Stratal({ exceptionHandler: AppExceptionHandler })`.

## Quarry CLI

Run `npx quarry help` to see all commands. Always use these to inspect your app before reading code.

| Command | What It Does |
|---------|-------------|
| `npx quarry list` | Show all registered commands |
| `npx quarry help <cmd>` | Show usage for a command |
| `npx quarry route:list` | List all HTTP routes (method, path, name) |
| `npx quarry event:list` | List all event listeners |
| `npx quarry schedule:list` | List all cron schedules |
| `npx quarry queue:list` | List all queue consumers |
| `npx quarry db:seed:list` | List all seeders |
| `npx quarry mcp:tools` | Preview MCP tools from your API |
| `npx quarry mcp:serve` | Start MCP stdio server exposing routes as tools |
| `npx quarry api` | Serve the OpenAPI spec |

For full CLI reference including custom command creation, see `references/quarry-cli.md`.

## Entry Point

```typescript
// src/index.ts
import { Stratal } from 'stratal'
import { AppModule } from './app.module'

export default new Stratal({ module: AppModule })
```

Constructor config:
- `module` (required) — Root module class or dynamic module
- `exceptionHandler?` — Custom `ExceptionHandler` subclass
- `logging?` — `{ level?, formatter? }` (`'json'` | `'pretty'`)
- `versioning?` — `{ prefix?, defaultVersion? }`

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

Two patterns (never mix in one controller):

### Convention-Based (REST Resources)

Method names map automatically: `index` -> GET, `show` -> GET /:id, `create` -> POST, `update` -> PUT /:id, `patch` -> PATCH /:id, `destroy` -> DELETE /:id.

```typescript
import { Controller, Route } from 'stratal/router'
import { z } from 'stratal/validation'

@Controller('/api/v1/notes', { tags: ['Notes'] })
export class NotesController {
  constructor(@inject(NotesService) private service: NotesService) {}

  @Route({ response: z.array(noteSchema) })
  async index(ctx: RouterContext) {
    return ctx.json(await this.service.list())
  }

  @Route({ body: createNoteSchema, response: noteSchema })
  async create(ctx: RouterContext) {
    return ctx.json(await this.service.create(ctx.body()), 201)
  }
}
```

### Explicit Decorators

```typescript
import { Controller, Get, Post } from 'stratal/router'

@Controller('/api/v1/notes')
export class NotesController {
  @Get('/', { response: z.array(noteSchema) })
  async list(ctx: RouterContext) { ... }

  @Post('/', { body: createNoteSchema, response: noteSchema, statusCode: 201 })
  async createNote(ctx: RouterContext) { ... }
}
```

For full routing reference (RouteConfig, RouterContext API, OpenAPI), see `references/routing.md`.

## File Conventions

### Directory Structure

```
src/
  index.ts                    # Entry point
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

Core: `stratal`, `stratal/cache`, `stratal/config`, `stratal/consumer`, `stratal/cron`, `stratal/di`, `stratal/email`, `stratal/errors`, `stratal/events`, `stratal/i18n`, `stratal/logger`, `stratal/module`, `stratal/openapi`, `stratal/quarry`, `stratal/queue`, `stratal/router`, `stratal/seeder`, `stratal/storage`, `stratal/validation`

Framework: `@stratal/framework/auth`, `@stratal/framework/context`, `@stratal/framework/database`, `@stratal/framework/factory`, `@stratal/framework/guards`, `@stratal/framework/rbac`

Testing: `@stratal/testing`, `@stratal/testing/mocks`, `@stratal/testing/vitest-plugin`

Inertia: `@stratal/inertia`, `@stratal/inertia/vite`

## Workflows

### Create a New Feature Module

1. Create feature directory: `src/domain/notes/`
2. Create tokens file `notes.tokens.ts` with Symbol-based tokens (if needed)
3. Create service `notes.service.ts` with `@Transient()`
4. Create controller `notes.controller.ts` with `@Controller('/api/v1/notes')`
5. Create module `notes.module.ts` with `@Module({ providers: [NotesService], controllers: [NotesController] })`
6. Add `NotesModule` to root module's `imports`
7. Run `npx quarry route:list` to verify routes are registered

### Add CRUD Endpoints

1. Define Zod schemas in `schemas/` — call `.openapi('SchemaName')` on each
2. Create controller with `@Controller('/api/v1/resource', { tags: ['Resource'] })`
3. Implement convention methods: `index`, `show`, `create`, `update`, `destroy`
4. Add `@Route()` with `body`, `params`, `query`, `response` on each method
5. Run `npx quarry route:list` to verify

### Add Custom Error Handling

1. Create `src/exceptions/app-exception-handler.ts` extending `ExceptionHandler`
2. Implement `register()` with `reportable()`, `renderable()`, `dontReport()` as needed
3. Pass to entry point: `new Stratal({ module: AppModule, exceptionHandler: AppExceptionHandler })`
4. Create custom error classes extending `ApplicationError` with error codes in 5000-8999 range

See `references/errors-and-i18n.md` for the full ExceptionHandler API.

### Set Up Inertia.js SSR

1. Install: `yarn add @stratal/inertia`
2. Configure `InertiaModule.forRoot({ rootView: 'app', ssr: { bundle: () => import('./ssr') } })` in root module
3. Use `@InertiaGet('/')` / `@InertiaPost('/')` and `ctx.inertia('page/Name', props)` in controllers (or `@InertiaRoute()` for convention routing)
4. Run `npx quarry inertia:dev` for development

See `references/inertia.md` for props, shared data, type safety, and Vite setup.

### Expose API as MCP Server

1. Run `npx quarry mcp:serve` to start the stdio MCP server
2. Filter with `--tag=Notes` or `--path=/api/v1` to expose specific routes
3. Run `npx quarry mcp:tools` to preview which tools will be exposed

See `references/quarry-cli.md` for all MCP flags and options.

## Example Interactions

**User says "Create a notes module with CRUD"** -> Create `src/domain/notes/` with module, controller, service, Zod schemas with `.openapi()`. Use convention routing. Register in root module. Run `npx quarry route:list` to verify.

**User says "Add authentication"** -> Read `references/auth-and-rbac.md`. Configure `AuthModule.forRootAsync()`. Add `@UseGuards(AuthGuard())` to controllers.

**User says "Write tests for my service"** -> Read `references/testing.md`. Use `Test.createTestingModule()` with provider overrides. Use `module.http` for HTTP tests, `module.get()` for unit tests.

**User says "Set up the database"** -> Read `references/database.md`. Configure `DatabaseModule.forRootAsync()` with ZenStack.

**User says "Add custom error handling"** -> Read `references/errors-and-i18n.md`. Create `ExceptionHandler` subclass, implement `register()`, pass to `Stratal` constructor.

**User says "Set up Inertia.js"** -> Read `references/inertia.md`. Install `@stratal/inertia`, configure `InertiaModule.forRoot()`, use `@InertiaRoute()` + `ctx.inertia()`.

**User says "Expose my API as MCP tools"** -> Run `npx quarry mcp:serve`. Use `--tag` or `--path` flags to filter. Preview with `npx quarry mcp:tools`.

**User says "List all routes" / "Debug my app"** -> Run `npx quarry route:list`. Also try `event:list`, `schedule:list`, `queue:list` to inspect other registrations.

**User says "I have an existing Hono app"** -> Read `references/incremental-adoption.md`. Mount Stratal as sub-app via `stratal.hono`.

## Reference Loading Guide

Load these when the task needs deeper knowledge:

| Reference | When to Load |
|-----------|-------------|
| `references/quarry-cli.md` | CLI commands, MCP server setup, custom command creation, debugging |
| `references/modules-and-di.md` | Provider types, scopes, container API, dynamic modules |
| `references/routing.md` | RouteConfig details, RouterContext API, OpenAPI, versioning |
| `references/errors-and-i18n.md` | ExceptionHandler, ApplicationError, error codes, i18n, withI18n() |
| `references/inertia.md` | Inertia.js setup, rendering, props, SSR, type safety, Vite |
| `references/database.md` | DatabaseModule, ZenStack, connections, plugins, transactions |
| `references/auth-and-rbac.md` | Better Auth, AuthContext, Casbin RBAC, AuthGuard |
| `references/events.md` | Event listeners, @On/@Listener, database events, wildcards |
| `references/queues-and-cron.md` | Queue consumers, senders, cron jobs, wrangler config |
| `references/seeders.md` | Database seeders, calling other seeders |
| `references/middleware-and-guards.md` | Middleware pipeline, guards, @UseGuards |
| `references/testing.md` | TestingModule, TestHttpClient, mocks, factories |
| `references/infrastructure.md` | Cache (KV), Logger, Email (Resend/SMTP), Storage (R2/S3), OpenAPI |
| `references/config.md` | ConfigService, registerAs(), namespaces |
| `references/incremental-adoption.md` | Mounting Stratal into existing Hono app |
| `assets/project-scaffold.md` | New project template (only when scaffolding from scratch) |

## Troubleshooting

**"No injectable constructor"** -> Missing `@Transient()` on the class.

**"Token not registered"** -> Provider not in any module's `providers`, or module not imported.

**"Cannot mix convention and HTTP decorators"** -> Pick one routing pattern per controller.

**Zod validation errors not translated** -> Imported `z` from `zod` instead of `stratal/validation`.

**Cron job not firing** -> `schedule` string doesn't match `wrangler.jsonc` trigger.

**Queue messages not consumed** -> Check: consumer in `consumers` array (not `providers`), `messageTypes` matches dispatched `type`, `QueueModule.registerQueue()` called, queue binding in `wrangler.jsonc`.

**ExceptionHandler `register()` not called** -> Did you pass `exceptionHandler` to `new Stratal()`? The handler class must also have `@Transient()`.

**Inertia returns JSON instead of full HTML** -> Missing SSR bundle configuration. Check `ssr.bundle` in `InertiaModule.forRoot()` options.

**Routes not showing in `route:list`** -> Controller not in module's `controllers` array, or module not imported in root module.
