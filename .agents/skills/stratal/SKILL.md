---
name: stratal
description: "Build Cloudflare Workers apps with the Stratal framework (stratal, @stratal/framework, @stratal/testing). Use when user asks to create Stratal modules, controllers, services, or routes, or when code imports from 'stratal' or '@stratal/*', or when scaffolding a new Stratal project. Also use for queue consumers, cron jobs, seeders, CLI commands, auth, database, RBAC, and testing in Stratal apps. Do NOT use for generic Hono apps without Stratal, plain Cloudflare Workers, or NestJS projects."
license: MIT
compatibility: Designed for Claude Code. Requires Node.js 20+, yarn.
metadata:
  author: strataljs
  version: "1.0"
---

# Stratal Framework

Stratal is a modular Cloudflare Workers framework with dependency injection (tsyringe), Hono-based routing with OpenAPI generation, queue consumers, cron jobs, i18n, caching, storage, and email. ESM-only.

Three packages:
- `stratal` — core framework (modules, DI, routing, queues, cron, events, seeders, CLI)
- `@stratal/framework` — auth (Better Auth), database ORM (ZenStack), RBAC (Casbin), guards, factories
- `@stratal/testing` — test utilities, mocks, HTTP client, factories

## Critical Rules (Read First)

These are non-negotiable. Breaking any of these causes runtime failures.

1. **Every injectable class MUST have `@Transient()`** — tsyringe requires `@injectable()` metadata. `@Transient()` wraps it. Without it, DI resolution fails silently or throws. `@Controller()` applies it automatically.

2. **Import `z` from `stratal/validation`, NOT from `zod`** — Stratal wraps Zod with i18n support. Direct `zod` imports bypass validation translations.

3. **Never import directly from `tsyringe`** — Use `import { inject } from 'stratal/di'` instead. Stratal re-exports `inject` and other tsyringe utilities from `stratal/di`.

4. **Use `reflect-metadata`** — tsyringe needs it. The entry point (`Stratal` class) imports it automatically. Test setup files must import it too.

5. **`experimentalDecorators` and `emitDecoratorMetadata` must be `true`** in tsconfig — required by tsyringe.

6. **Convention routing and HTTP method decorators cannot mix** — In a single controller, use EITHER convention-based (`@Route()` with method names `index`, `show`, `create`, `update`, `patch`, `destroy`) OR explicit decorators (`@Get()`, `@Post()`, etc.). Never both. Convention routing is best suited for REST resource controllers.

7. **ESM-only** — `"type": "module"` in package.json. No CommonJS.

8. **DI tokens** — Use class-as-token for simple cases (bare class in `providers`). Use `Symbol.for()` for shareable modules, value providers, and factory providers. Group Symbol tokens in a `tokens.ts` file.

9. **Cron schedules must match `wrangler.jsonc`** — `CronJob.schedule` must exactly match a trigger in `[triggers]`.

10. **I18nModule must be configured and I18nService must be used for translations** — Do not hardcode user-facing strings. `I18nModule.forRoot()` is config-only (locales, fallback). Use `I18nModule.registerMessages()` to add translation messages. Use `I18nService.t()` for messages and `withI18n()` for Zod validation messages.

## Entry Point

```typescript
// src/index.ts
import { Stratal } from 'stratal'
import { AppModule } from './app.module'

export default new Stratal({ module: AppModule })
```

The `Stratal` class is the Hono-style entry point for Cloudflare Workers. It handles `fetch`, `queue`, and `scheduled` events. It eagerly bootstraps the `Application` at construction time.

Constructor config: `{ module: AppModule, logging?: { level, formatter }, versioning?: { prefix, defaultVersion } }`

## Module System

Modules organize the application into cohesive blocks. Use `@Module()` decorator.

```typescript
import { Module } from 'stratal/module'

@Module({
  imports: [OtherModule],          // Other modules to import
  providers: [MyService, MyRepo],  // Services, repositories, listeners, seeders, commands
  controllers: [MyController],    // Route controllers
  consumers: [MyConsumer],        // Queue consumers
  jobs: [MyJob],                  // Cron jobs
})
export class MyModule {}
```

### Dynamic Modules

```typescript
@Module({ providers: [] })
export class ConfigModule {
  static forRoot(options: ConfigOptions): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: CONFIG_TOKEN, useValue: options }],
    }
  }
}

// Async with DI
@Module({ providers: [] })
export class DbModule {
  static forRootAsync(options: AsyncModuleOptions<DbConfig>): DynamicModule {
    return {
      module: DbModule,
      providers: [{ provide: DB_TOKEN, useFactory: options.useFactory, inject: options.inject }],
    }
  }
}
```

### Lifecycle Hooks

```typescript
export class MyModule implements OnInitialize, OnShutdown {
  onInitialize(ctx: ModuleContext): void { /* after all providers registered */ }
  onShutdown(ctx: ModuleContext): void { /* during shutdown */ }
}
```

For reference on middleware configuration, see `references/middleware-and-guards.md`.

## Dependency Injection

```typescript
import { Transient, Scope, inject } from 'stratal/di'

// Injectable class
@Transient()
export class MyService {
  constructor(
    @inject(OtherService) private other: OtherService,
  ) {}
}

// Symbol tokens for value/factory providers
export const MY_TOKENS = {
  Config: Symbol.for('MyModule:Config'),
}

// Provider with scope
@Module({
  providers: [
    { provide: MY_TOKENS.Config, useValue: { key: 'value' }, scope: Scope.Singleton },
    MyService,
  ],
})
```

Provider types: `ClassProvider`, `ValueProvider`, `FactoryProvider`, `ExistingProvider`, or bare class constructor.

Scopes: `Scope.Transient` (default), `Scope.Singleton`, `Scope.Request` (per HTTP request).

For full DI reference, see `references/modules-and-di.md`.

## Controllers & Routing

Two routing patterns (never mix in one controller):

### Convention-Based (Best for REST Resources)

Method names map to HTTP methods and paths automatically:
- `index()` → `GET /base-path`
- `show()` → `GET /base-path/:id`
- `create()` → `POST /base-path` (status 201)
- `update()` → `PUT /base-path/:id`
- `patch()` → `PATCH /base-path/:id`
- `destroy()` → `DELETE /base-path/:id`

```typescript
import { Controller, Route } from 'stratal/router'
import { inject } from 'stratal/di'
import { z } from 'stratal/validation'

@Controller('/api/v1/notes', { tags: ['Notes'], security: ['bearerAuth'] })
export class NotesController {
  constructor(@inject(NotesService) private service: NotesService) {}

  @Route({
    query: paginationSchema,
    response: z.array(noteSchema),
  })
  async index(ctx: RouterContext): Promise<Response> {
    const notes = await this.service.list(ctx.query())
    return ctx.json(notes)
  }

  @Route({
    body: createNoteSchema,
    response: noteSchema,
    description: 'Create a note',
  })
  async create(ctx: RouterContext): Promise<Response> {
    const body = ctx.body()
    const note = await this.service.create(body)
    return ctx.json(note, 201)
  }

  @Route({
    params: z.object({ id: z.string().uuid() }),
    response: noteSchema,
  })
  async show(ctx: RouterContext): Promise<Response> {
    return ctx.json(await this.service.findById(ctx.param('id')))
  }
}
```

### Explicit HTTP Decorators

```typescript
import { Controller, Get, Post, Delete } from 'stratal/router'
import { inject } from 'stratal/di'

@Controller('/api/v1/notes')
export class NotesController {
  @Get('/', { response: z.array(noteSchema) })
  async list(ctx: RouterContext) { ... }

  @Post('/', { body: createNoteSchema, response: noteSchema, statusCode: 201 })
  async createNote(ctx: RouterContext) { ... }

  @Delete('/:id', { params: z.object({ id: z.string().uuid() }), response: z.object({}) })
  async deleteNote(ctx: RouterContext) { ... }
}
```

`RouteConfig` fields: `body`, `params`, `query`, `response` (required), `tags`, `security`, `description`, `summary`, `hideFromDocs`, `statusCode`.

`RouterContext` API: `ctx.json(data, status?)`, `ctx.body<T>()`, `ctx.param(key)`, `ctx.query(key?)`, `ctx.header(name)`, `ctx.text()`, `ctx.html()`, `ctx.redirect()`, `ctx.stream()`, `ctx.streamText()`, `ctx.streamSSE()`, `ctx.getContainer()`, `ctx.c` (native Hono context).

For full routing reference, see `references/routing.md`.

## File Conventions & Imports

### Directory Structure (Domain-Based)

```
src/
  index.ts                    # Entry point
  app.module.ts               # Root module
  types/
    env.ts                    # StratalEnv module augmentation
    events.d.ts               # Custom event registry augmentation
  domain/
    notes/
      notes.module.ts
      notes.controller.ts
      notes.service.ts
      notes.repository.ts
      notes.tokens.ts
      schemas/
        note.schema.ts
        create-note.schema.ts
      __tests__/
        notes.controller.spec.ts
        notes.service.spec.ts
    users/
      users.module.ts
      ...
```

### StratalEnv Module Augmentation

Every Stratal app must declare the `StratalEnv` interface so the framework knows the Cloudflare env shape:

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

## Step-by-Step Workflows

### Create a New Feature Module

1. Create feature directory: `src/domain/notes/`
2. Create tokens file: `notes.tokens.ts` with Symbol-based tokens (if needed for value/factory providers)
3. Create service: `notes.service.ts` with `@Transient()` decorator
4. Create controller: `notes.controller.ts` with `@Controller('/api/v1/notes')` and `@Route()` methods
5. Create module: `notes.module.ts` with `@Module({ providers: [NotesService], controllers: [NotesController] })`
6. Import in `app.module.ts`: add `NotesModule` to `imports`

### Add CRUD Endpoints

1. Define Zod schemas in `schemas/` — use `.openapi('SchemaName')` on each schema for OpenAPI naming
2. Create controller with `@Controller('/api/v1/resource', { tags: ['Resource'] })`
3. Implement convention methods: `index()`, `show()`, `create()`, `update()`, `destroy()`
4. Add `@Route()` with `body`, `params`, `query`, `response` schemas on each method
5. Register controller in module's `controllers` array

### Add a Queue Consumer

1. Import `QueueModule` and call `QueueModule.registerQueue('my-queue')` in your module imports
2. Create consumer class implementing `IQueueConsumer<PayloadType>`
3. Add `@Transient()` decorator
4. Set `readonly messageTypes = ['type.name']`
5. Implement `handle(message: QueueMessage<PayloadType>)` method
6. Add consumer to module's `consumers` array
7. Add queue binding in `wrangler.jsonc`

## Example Interactions

**User says "Create a notes module with CRUD"** → Create `src/domain/notes/` directory with `notes.module.ts`, `notes.controller.ts`, `notes.service.ts`, Zod schemas with `.openapi()`, and register in `app.module.ts`. Use convention-based routing.

**User says "Add authentication to my controller"** → Read `references/auth-and-rbac.md` and `references/middleware-and-guards.md`. Add `@UseGuards(AuthGuard())` to controller. Ensure `AuthModule.forRootAsync()` is imported.

**User says "Write tests for my service"** → Read `references/testing.md`. Use `Test.createTestingModule()` with the module, override providers as needed, use `module.http` for HTTP tests or `module.get()` for unit tests.

**User says "Set up the database"** → Read `references/database.md`. Configure `DatabaseModule.forRootAsync()` with ZenStack.

**User says "I have an existing Hono app and want to add Stratal"** → Read `references/incremental-adoption.md`. Mount Stratal as sub-app using `stratal.hono`, forward queue/scheduled handlers.

## Reference Loading Guide

Load these reference files when the task requires deeper knowledge:

| Reference | When to Load |
|-----------|-------------|
| `references/modules-and-di.md` | Provider configuration, scopes, container API, dynamic modules |
| `references/routing.md` | Route configuration details, OpenAPI, versioning, RouterContext |
| `references/config.md` | ConfigService, registerAs(), ConfigModule, namespaces |
| `references/database.md` | DatabaseModule setup, ZenStack, connections, plugins |
| `references/auth-and-rbac.md` | Authentication, authorization, Better Auth, Casbin |
| `references/events.md` | Event listeners, database events, wildcards |
| `references/queues-and-cron.md` | Queue consumers, senders, cron jobs, wrangler config |
| `references/seeders-and-commands.md` | Database seeders, Quarry CLI commands |
| `references/middleware-and-guards.md` | Middleware pipeline, guards, UseGuards |
| `references/testing.md` | TestingModule, TestHttpClient, mocks, factories |
| `references/infrastructure.md` | Cache, Logger, Email, Storage, OpenAPI services |
| `references/errors-and-i18n.md` | ApplicationError, error codes, I18n, withI18n() |
| `references/incremental-adoption.md` | Mounting Stratal into existing Hono app, gradual migration |
| `references/gotchas.md` | CF Workers constraints, common errors, troubleshooting |
| `assets/project-scaffold.md` | New project template (only when scaffolding from scratch) |

## Troubleshooting

**"No injectable constructor"** → Missing `@Transient()` on the class. Every DI-resolved class needs it (except controllers, which get it from `@Controller()`).

**"Token not registered"** → The token isn't in any module's `providers`. Add a provider entry or ensure the module is imported.

**"Cannot mix convention and HTTP decorators"** → A controller has both `@Route()` and `@Get()`/`@Post()`. Pick one pattern.

**Zod validation errors not translated** → You imported `z` from `zod` instead of `stratal/validation`.

**Cron job not firing** → The `schedule` string doesn't match any trigger in `wrangler.jsonc`.

**Queue messages not consumed** → Consumer's `messageTypes` doesn't match the dispatched `type` field, or consumer isn't in the module's `consumers` array, or `QueueModule.registerQueue()` wasn't called for the queue.
