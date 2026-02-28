---
name: stratal
description: >-
  Build Cloudflare Workers apps with the Stratal framework — modular architecture,
  dependency injection (tsyringe), Hono-based routing with automatic OpenAPI docs,
  queue consumers, cron jobs, email, storage, caching, and i18n. Use when creating,
  modifying, or testing a Stratal application, or when mentions of stratal, StratalWorker,
  @Module, @Controller, @Route, IController, RouterContext appear.
license: MIT
metadata:
  author: strataljs
  version: "1.0"
---

# Stratal Framework

Stratal is a modular Cloudflare Workers framework. It provides dependency injection (tsyringe), Hono-based routing with automatic OpenAPI 3.0 docs, queue consumers, cron jobs, email, storage, caching, and i18n.

**Key constraints:**
- ESM-only (`"type": "module"`)
- Build with `tsc` only — **never** esbuild/tsup (tsyringe requires `emitDecoratorMetadata`)
- `experimentalDecorators` and `emitDecoratorMetadata` must be enabled in tsconfig
- Two packages: `stratal` (core framework), `@stratal/testing` (test utilities)
- Always import Zod from `stratal/validation`, never from `zod` directly

## Quick Start

### Worker Entry Point

```typescript
import { StratalWorker, type ApplicationConfig } from 'stratal'
import { AppModule } from './app.module'

export default class Backend extends StratalWorker {
  protected configure(): ApplicationConfig {
    return {
      module: AppModule,
    }
  }
}
```

`StratalWorker` extends Cloudflare's `WorkerEntrypoint`. It handles HTTP fetch, queue batches, and scheduled cron triggers automatically.

### Root Module

```typescript
import { Module } from 'stratal'
import { UsersModule } from './users/users.module'

@Module({
  imports: [UsersModule],
})
export class AppModule {}
```

### Controller

```typescript
import { Controller, Route, type IController, type RouterContext } from 'stratal/router'
import { z } from 'stratal/validation'
import { inject } from 'stratal/di'
import { Transient } from 'stratal/di'

const userSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
})

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
})

const USER_TOKENS = {
  UserService: Symbol.for('UserService'),
}

@Controller('/api/v1/users', { tags: ['Users'] })
export class UsersController implements IController {
  constructor(
    @inject(USER_TOKENS.UserService) private readonly userService: UserService,
  ) {}

  @Route({ response: z.array(userSchema) })
  async index(ctx: RouterContext) {
    const users = await this.userService.findAll()
    return ctx.json(users)
  }

  @Route({
    params: z.object({ id: z.string().uuid() }),
    response: userSchema,
  })
  async show(ctx: RouterContext) {
    const user = await this.userService.findById(ctx.param('id'))
    return ctx.json(user)
  }

  @Route({ body: createUserSchema, response: userSchema })
  async create(ctx: RouterContext) {
    const body = await ctx.body<{ name: string; email: string }>()
    const user = await this.userService.create(body)
    return ctx.json(user, 201)
  }

  @Route({
    params: z.object({ id: z.string().uuid() }),
    body: createUserSchema.partial(),
    response: userSchema,
  })
  async update(ctx: RouterContext) {
    const body = await ctx.body()
    const user = await this.userService.update(ctx.param('id'), body)
    return ctx.json(user)
  }

  @Route({
    params: z.object({ id: z.string().uuid() }),
    response: z.object({ success: z.boolean() }),
  })
  async destroy(ctx: RouterContext) {
    await this.userService.delete(ctx.param('id'))
    return ctx.json({ success: true })
  }
}
```

### Method Name to HTTP Mapping

| Method   | HTTP    | Path Suffix | Status |
|----------|---------|-------------|--------|
| `index`  | GET     | `/`         | 200    |
| `show`   | GET     | `/:id`      | 200    |
| `create` | POST    | `/`         | 201    |
| `update` | PUT     | `/:id`      | 200    |
| `patch`  | PATCH   | `/:id`      | 200    |
| `destroy`| DELETE  | `/:id`      | 200    |

Controllers must implement `IController`. Method names **must** match the table above — the framework auto-derives the HTTP method, path, and status code from the method name.

For non-RESTful routes (wildcards, custom patterns), implement a `handle()` method instead.

> [!reference] For full RouteConfig, ControllerOptions, RouterContext API, and OpenAPI setup, see [routing.md](references/routing.md)

## Dependency Injection

### Tokens

Always use **Symbol-based** tokens, never string tokens:

```typescript
const TOKENS = {
  UserService: Symbol.for('UserService'),
  UserRepository: Symbol.for('UserRepository'),
}
```

### Services

Decorate injectable services with `@Transient()`:

```typescript
import { Transient } from 'stratal/di'
import { inject } from 'stratal/di'

@Transient()
export class UserService {
  constructor(
    @inject(TOKENS.UserRepository) private readonly repo: UserRepository,
  ) {}
}
```

### Provider Types

Register providers in `@Module({ providers: [...] })`:

```typescript
// Class provider (shorthand — class used as both token and implementation)
providers: [UserService]

// Class provider with explicit token
{ provide: TOKENS.UserService, useClass: UserService }

// Class provider with scope
{ provide: TOKENS.UserService, useClass: UserService, scope: Scope.Singleton }

// Value provider
{ provide: TOKENS.Config, useValue: { apiUrl: 'https://...' } }

// Factory provider
{ provide: TOKENS.Formatter, useFactory: (config) => new Formatter(config), inject: [TOKENS.Config] }

// Alias provider
{ provide: TOKENS.IUserService, useExisting: UserService }
```

### Scopes

```typescript
import { Scope } from 'stratal/di'

Scope.Transient   // New instance per resolution (default)
Scope.Singleton   // Single instance globally
Scope.Request     // New instance per HTTP request
```

### StratalEnv Augmentation

Run `npx wrangler types` to auto-generate `Cloudflare.Env` from your `wrangler.jsonc`, then extend it:

```typescript
// src/types/env.ts
declare module 'stratal' {
  interface StratalEnv extends Cloudflare.Env {}
}
```

This keeps your env types in sync with `wrangler.jsonc` automatically. The base `StratalEnv` already includes `ENVIRONMENT: string` and `CACHE: KVNamespace`.

> [!reference] For Container API, conditional bindings, request scope, and dynamic modules, see [modules-and-di.md](references/modules-and-di.md)

## Guards and Middleware

### Guards

Guards implement `CanActivate` and protect routes:

```typescript
import { type CanActivate, UseGuards } from 'stratal/guards'
import { type RouterContext } from 'stratal/router'
import { Transient } from 'stratal/di'

@Transient()
export class AuthGuard implements CanActivate {
  async canActivate(context: RouterContext): Promise<boolean> {
    const token = context.header('Authorization')
    return !!token
  }
}

// Apply to entire controller
@Controller('/api/v1/admin')
@UseGuards(AuthGuard)
export class AdminController implements IController { ... }

// Apply to single route method
@UseGuards(AuthGuard)
async create(ctx: RouterContext) { ... }
```

### Middleware

Modules implement `MiddlewareConfigurable` to apply middleware:

```typescript
import { type MiddlewareConfigurable, type MiddlewareConsumer, type Middleware } from 'stratal/middleware'
import { type RouterContext } from 'stratal/router'

@Transient()
export class LoggingMiddleware implements Middleware {
  async handle(ctx: RouterContext, next: () => Promise<void>): Promise<void> {
    console.log(`${ctx.c.req.method} ${ctx.c.req.url}`)
    await next()
  }
}

@Module()
export class AppModule implements MiddlewareConfigurable {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(LoggingMiddleware)
      .exclude({ path: '/health', method: 'get' })
      .forRoutes('*')
  }
}
```

`forRoutes()` accepts `'*'` (all), controller classes, or `{ path, method }` objects.

## Queue Consumers and Cron Jobs

### Queue Consumers

```typescript
import { Transient } from 'stratal/di'
import { type IQueueConsumer, type QueueMessage } from 'stratal/queue'

interface OrderPayload {
  orderId: string
  amount: number
}

@Transient()
export class OrderCreatedConsumer implements IQueueConsumer<OrderPayload> {
  readonly messageTypes = ['order.created']

  async handle(message: QueueMessage<OrderPayload>): Promise<void> {
    const { orderId, amount } = message.payload
    // Process the order
  }

  async onError(error: Error, message: QueueMessage<OrderPayload>): Promise<void> {
    console.error(`Failed to process order: ${message.payload.orderId}`, error)
  }
}
```

Register consumers in `@Module({ consumers: [OrderCreatedConsumer] })`.

### Cron Jobs

```typescript
import { Transient } from 'stratal/di'
import { type CronJob } from 'stratal/cron'

@Transient()
export class DailyReportJob implements CronJob {
  readonly schedule = '0 2 * * *' // Daily at 2 AM UTC

  async execute(controller: ScheduledController): Promise<void> {
    // Generate report
  }

  async onError(error: Error): Promise<void> {
    console.error('Report generation failed', error)
  }
}
```

Register jobs in `@Module({ jobs: [DailyReportJob] })`.

Also add matching cron triggers in `wrangler.jsonc`.

> [!reference] For QueueMessage interface, QueueModule setup, EmailModule config, and dispatch patterns, see [queues-cron-email.md](references/queues-cron-email.md)

## Built-in Modules

| Module | Import | Setup | Purpose |
|--------|--------|-------|---------|
| OpenAPIModule | `stratal` | `.forRoot({ info, securitySchemes })` | Automatic API docs at `/api/docs` |
| ConfigModule | `stratal/config` | `.forRoot({ load: [dbConfig] })` | Typed config with `registerAs()` |
| CacheModule | `stratal/cache` | auto-registered | KV-backed caching via `CACHE` binding |
| EmailModule | `stratal/email` | `.forRoot({ provider, from, queue })` | Resend or SMTP email |
| StorageModule | `stratal/storage` | `.forRoot({ storage, defaultStorageDisk })` | S3-compatible file storage |
| I18nModule | `stratal/i18n` | `.forRoot({ defaultLocale, messages })` | Type-safe translations |
| QueueModule | `stratal/queue` | `.forRootAsync(...)` | Queue producer/consumer |

> [!reference] For detailed module configuration, see [config-cache-storage-i18n.md](references/config-cache-storage-i18n.md)

## Error Handling

Stratal uses typed errors with numeric codes and i18n-translatable messages:

```typescript
import { ApplicationError, type ErrorCode } from 'stratal/errors'

export class UserNotFoundError extends ApplicationError {
  constructor(userId: string) {
    super('errors.user.not_found', 4000, { userId })
  }
}
```

Error code ranges by domain:

| Range | Domain |
|-------|--------|
| 1000-1999 | Validation |
| 2000-2999 | Database |
| 3000-3099 | Authentication |
| 3100-3199 | Authorization |
| 4000-4999 | Resource |
| 9000-9999 | System/Internal |

The built-in `GlobalErrorHandler` catches `ApplicationError` subclasses and returns structured JSON with translated messages. Throw from controllers or services — the handler will catch it.

## Testing

Install `@stratal/testing` as a dev dependency:

```typescript
import { Test, type TestingModule } from '@stratal/testing'

describe('UsersController', () => {
  let module: TestingModule

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [UsersModule],
    }).compile()
  })

  afterEach(async () => {
    await module.close()
  })

  it('lists users', async () => {
    const response = await module.http.get('/api/v1/users').send()

    response.assertOk()
    response.assertJsonStructure(['id', 'name', 'email'])
  })

  it('creates a user', async () => {
    const response = await module.http
      .post('/api/v1/users')
      .withBody({ name: 'Alice', email: 'alice@example.com' })
      .asJson()
      .send()

    response.assertCreated()
    response.assertJsonPath('name', 'Alice')
  })
})
```

### Provider Overrides

```typescript
const module = await Test.createTestingModule({
  imports: [UsersModule],
})
  .overrideProvider(TOKENS.UserRepository)
  .useValue(mockRepository)
  .compile()
```

### Resolve Services

```typescript
const userService = module.get<UserService>(TOKENS.UserService)
```

> [!reference] For TestHttpClient API, assertion methods, FakeStorageService, and test patterns, see [testing.md](references/testing.md)

## Sub-path Imports

| Import | Exports |
|--------|---------|
| `stratal` | Application, StratalWorker, Module, OpenAPIModule, LogLevel, StratalEnv, Constructor, ApplicationConfig |
| `stratal/di` | Container, inject, Transient, Scope, DI_TOKENS, CONTAINER_TOKEN |
| `stratal/router` | Controller, Route, IController, RouterContext, UseGuards, ROUTER_TOKENS |
| `stratal/validation` | z (Zod), ZodType, ZodObject — always use this, not `zod` directly |
| `stratal/errors` | ApplicationError, ErrorCode, ERROR_CODES |
| `stratal/i18n` | I18nModule, I18nService, I18N_TOKENS, MessageKeys |
| `stratal/cache` | CacheModule, CacheService, CACHE_TOKENS |
| `stratal/config` | ConfigModule, registerAs, InferConfigType, CONFIG_TOKENS |
| `stratal/logger` | LoggerService, LOGGER_TOKENS, LogLevel |
| `stratal/queue` | QueueModule, IQueueConsumer, QueueMessage, QUEUE_TOKENS |
| `stratal/cron` | CronJob |
| `stratal/email` | EmailModule, EMAIL_TOKENS |
| `stratal/storage` | StorageModule, StorageService, STORAGE_TOKENS |
| `stratal/guards` | CanActivate, UseGuards |
| `stratal/middleware` | Middleware, MiddlewareConfigurable, MiddlewareConsumer |
| `stratal/module` | Module, ModuleOptions, DynamicModule, OnInitialize, OnShutdown, ModuleContext |
| `stratal/worker` | StratalWorker |

## Best Practices

1. **One module per domain feature** — e.g., `UsersModule`, `OrdersModule`, `NotificationsModule`
2. **Symbol-based tokens** with descriptive names: `Symbol.for('UserService')`, not string tokens
3. **Use `registerAs()`** for typed configuration namespaces
4. **Controllers implement `IController`** — ensures type-safe method signatures
5. **Zod schemas for all request/response** — define once, get validation + OpenAPI docs
6. **`@Transient()` on all injectable services** — required for tsyringe metadata
7. **Import Zod from `stratal/validation`** — ensures OpenAPI compatibility layer

## Anti-Patterns

1. **Do NOT use esbuild or tsup** — `emitDecoratorMetadata` is not supported; build must use `tsc`
2. **Do NOT use string DI tokens** — always use `Symbol.for('...')` for token uniqueness
3. **Do NOT import `zod` directly** — use `stratal/validation` which wraps Zod with OpenAPI extensions
4. **Do NOT forget `@Transient()` on services** — without it, tsyringe cannot resolve constructor metadata
5. **Do NOT forget `IController` interface** — controllers must implement it for type safety
6. **Do NOT forget the `CACHE` KV binding** — needed in `wrangler.jsonc` if you use `CacheService`
7. **Do NOT use `ctx.req.valid('json')` in controllers** — use `ctx.body<T>()` which returns pre-validated data
8. **Do NOT register providers outside of modules** — always use `@Module({ providers: [...] })`

> [!reference] For project setup (wrangler.jsonc, tsconfig, env typing), see [project-setup.md](references/project-setup.md)
