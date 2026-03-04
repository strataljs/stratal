---
name: stratal
description: >-
  Build Cloudflare Workers apps with the Stratal framework — modular architecture,
  dependency injection (tsyringe), Hono-based routing with automatic OpenAPI docs,
  queue consumers, cron jobs, email, storage, caching, i18n, authentication (Better Auth),
  database (ZenStack ORM), RBAC (Casbin), guards, factories, and seeders. Use when
  creating, modifying, or testing a Stratal application, or when mentions of stratal,
  StratalWorker, @Module, @Controller, @Route, IController, RouterContext, AuthModule,
  DatabaseModule, RbacModule, AuthGuard, AuthContext, @InjectDB, DatabaseService,
  CasbinService, Factory, Seeder, SeederRunner, @stratal/framework, @stratal/seeders appear.
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
- Four packages: `stratal` (core), `@stratal/framework` (auth, database, RBAC, guards, factory), `@stratal/seeders` (database seeders), `@stratal/testing` (test utilities)
- Always import Zod from `stratal/validation`, never from `zod` directly

## Quick Start

### Worker Entry Point

```typescript
import { type ApplicationConfig } from 'stratal'
import { StratalWorker } from 'stratal/worker'
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
import { Module } from 'stratal/module'
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
import { inject, Transient } from 'stratal/di'

const userSchema = z.object({ id: z.string().uuid(), name: z.string(), email: z.string().email() })
const createUserSchema = z.object({ name: z.string().min(1), email: z.string().email() })

@Controller('/api/v1/users', { tags: ['Users'] })
export class UsersController implements IController {
  constructor(@inject(USER_TOKENS.UserService) private readonly userService: UserService) {}

  @Route({ response: z.array(userSchema) })
  async index(ctx: RouterContext) {
    const users = await this.userService.findAll()
    return ctx.json(users)
  }

  @Route({ body: createUserSchema, response: userSchema })
  async create(ctx: RouterContext) {
    const body = await ctx.body<{ name: string; email: string }>()
    const user = await this.userService.create(body)
    return ctx.json(user, 201)
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

Register in `@Module({ providers: [...] })`:

```typescript
providers: [UserService]                                                           // Class shorthand
{ provide: TOKENS.UserService, useClass: UserService }                             // Class with token
{ provide: TOKENS.UserService, useClass: UserService, scope: Scope.Singleton }     // Class with scope
{ provide: TOKENS.Config, useValue: { apiUrl: 'https://...' } }                    // Value
{ provide: TOKENS.Formatter, useFactory: (c) => new Formatter(c), inject: [TOKENS.Config] } // Factory
{ provide: TOKENS.IUserService, useExisting: UserService }                         // Alias
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

Guards implement `CanActivate` (return `boolean` from `canActivate(ctx)`). Apply with `@UseGuards()`:

```typescript
// Apply to entire controller
@Controller('/api/v1/admin')
@UseGuards(AuthGuard)
export class AdminController implements IController { ... }

// Apply to single route method
@UseGuards(AuthGuard)
async create(ctx: RouterContext) { ... }
```

### Middleware

Modules implement `MiddlewareConfigurable`. Middleware classes implement `Middleware` with `handle(ctx, next)`:

```typescript
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
}

@Transient()
export class OrderCreatedConsumer implements IQueueConsumer<OrderPayload> {
  readonly messageTypes = ['order.created']

  async handle(message: QueueMessage<OrderPayload>): Promise<void> {
    const { orderId } = message.payload
    // Process the order
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
}
```

Register jobs in `@Module({ jobs: [DailyReportJob] })`. Add matching cron triggers in `wrangler.jsonc`.

> [!reference] For QueueMessage interface, QueueModule setup, EmailModule config, and dispatch patterns, see [queues-cron-email.md](references/queues-cron-email.md)

## Built-in Modules

| Module | Import | Setup | Purpose |
|--------|--------|-------|---------|
| OpenAPIModule | `stratal/openapi` | `.forRoot({ info, securitySchemes })` | Automatic API docs at `/api/docs` |
| ConfigModule | `stratal/config` | `.forRoot({ load: [dbConfig] })` | Typed config with `registerAs()` |
| CacheModule | `stratal/cache` | auto-registered | KV-backed caching via `CACHE` binding |
| EmailModule | `stratal/email` | `.forRoot({ provider, from, queue })` | Resend or SMTP email |
| StorageModule | `stratal/storage` | `.forRoot({ storage, defaultStorageDisk })` | S3-compatible file storage |
| I18nModule | `stratal/i18n` | `.forRoot({ defaultLocale, messages })` | Type-safe translations |
| QueueModule | `stratal/queue` | `.forRootAsync(...)` | Queue producer/consumer |
| AuthModule | `@stratal/framework/auth` | `.withRootAsync(...)` | Better Auth integration |
| DatabaseModule | `@stratal/framework/database` | `.forRoot(config)` / `.forRootAsync(...)` | ZenStack ORM multi-connection |
| RbacModule | `@stratal/framework/rbac` | `.forRoot(options)` / `.forRootAsync(...)` | Casbin RBAC |

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

Override providers: `.overrideProvider(TOKEN).useValue(mock)` before `.compile()`. Resolve services: `module.get<T>(TOKEN)`.

> [!reference] For TestHttpClient API, assertion methods, FakeStorageService, and test patterns, see [testing.md](references/testing.md)

## @stratal/framework

### Installation

```bash
npm install @stratal/framework
# Then install peer deps for the features you use:
npm install better-auth @better-auth/core    # for AuthModule
npm install @zenstackhq/orm pg               # for DatabaseModule
npm install casbin                           # for RbacModule
npm install @faker-js/faker                  # for Factory
```

### Authentication

Better Auth integration with session middleware and request-scoped `AuthContext`:

```typescript
import { AuthModule } from '@stratal/framework/auth'
import { AuthContext } from '@stratal/framework/context'

@Module({
  imports: [
    AuthModule.withRootAsync({
      inject: [DI_TOKENS.Database, CONFIG_TOKENS.ConfigService],
      useFactory: (db, config) => createAuthOptions(db, config),
    }),
  ],
})
export class AppModule {}
```

Access current user via `@inject(DI_TOKENS.AuthContext)` → `authContext.requireUserId()`.

> [!reference] For AuthService API, middleware internals, AuthContext methods, error classes, and `wrapBetterAuth()`, see [framework-auth.md](references/framework-auth.md)

### Database

ZenStack ORM with multi-connection support. Inject via `@inject(DI_TOKENS.Database)`:

```typescript
import { DatabaseModule } from '@stratal/framework/database'

@Module({
  imports: [
    DatabaseModule.forRoot({
      default: 'main',
      connections: [{ name: 'main', schema: mainSchema, dialect: pgDialect }],
    }),
  ],
})
export class AppModule {}

// Required type augmentation
declare module '@stratal/framework/database' {
  interface DatabaseSchemaRegistry { main: typeof mainSchema }
  interface DefaultDatabaseConnection { name: 'main' }
}
```

> [!reference] For plugins (ErrorHandler, EventEmitter, SchemaSwitcher), events, error hierarchy, and PostgreSQL error mapping, see [framework-database.md](references/framework-database.md)

### RBAC and Guards

Casbin-based RBAC. Use `AuthGuard()` for auth-only, `AuthGuard({ scopes })` for permission checks:

```typescript
@Controller('/admin')
@UseGuards(AuthGuard({ scopes: ['admin:dashboard'] }))
export class AdminController implements IController { ... }
```

Setup: `RbacModule.forRoot({ model, defaultPolicies, roleHierarchy })` in module imports.

> [!reference] For RbacModule config, CasbinService API, model format, policy storage, and examples, see [framework-rbac-guards.md](references/framework-rbac-guards.md)

### Factories

Test data generation with Faker.js. Extend `Factory<Model, CreateInput>`, override `definition()`:

```typescript
const user = await new UserFactory().create(db)
const admins = await new UserFactory().admin().count(5).createManyAndReturn(db)
```

> [!reference] For Factory class API, `state()`, Sequence class, and full examples, see [framework-factory.md](references/framework-factory.md)

### Seeders

CLI-based database seeding. Extend `Seeder`, implement `run()`, register as bare class provider:

```bash
npx stratal-seed ./src/seeders/index.ts run user        # Run specific seeder
npx stratal-seed ./src/seeders/index.ts run --all       # Run all seeders
npx stratal-seed ./src/seeders/index.ts run user -d     # Dry run
npx stratal-seed ./src/seeders/index.ts list            # List seeders
```

Entry file: `SeederRunner.run(AppModule)` in `src/seeders/index.ts`.

> [!reference] For Seeder class, SeederRunner, discovery, registration, and dry-run mode, see [seeders.md](references/seeders.md)

## Sub-path Imports

| Import | Exports |
|--------|---------|
| `stratal` | Application, StratalEnv, Constructor, ApplicationConfig |
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
| `@stratal/framework` | Re-exports from all sub-paths |
| `@stratal/framework/auth` | AuthModule, AuthService, AUTH_SERVICE, AUTH_OPTIONS, wrapBetterAuth, auth errors |
| `@stratal/framework/context` | AuthContext, AuthInfo, UserNotAuthenticatedError, ContextNotInitializedError |
| `@stratal/framework/database` | DatabaseModule, DatabaseService, InjectDB, DATABASE_TOKENS, connectionSymbol, plugins, errors, customPgTypes |
| `@stratal/framework/factory` | Factory, Sequence |
| `@stratal/framework/guards` | AuthGuard |
| `@stratal/framework/rbac` | RbacModule, CasbinService, CasbinEnforcerService, RBAC_TOKENS, InsufficientPermissionsError |
| `@stratal/seeders` | Seeder, SeederRunner |

## Do's and Don'ts

**Do:**
- One module per domain feature (e.g., `UsersModule`, `OrdersModule`)
- Symbol-based tokens: `Symbol.for('UserService')`, never string tokens
- `@Transient()` on all injectable services — required for tsyringe metadata
- Controllers implement `IController` — ensures type-safe method signatures
- Zod schemas for all request/response — define once, get validation + OpenAPI docs
- Use `registerAs()` for typed configuration namespaces
- Use `AuthGuard()` for auth, `AuthGuard({ scopes })` for authorization
- Augment `DatabaseSchemaRegistry` and `DefaultDatabaseConnection` for type-safe DB access
- Register seeders as bare class providers: `@Module({ providers: [UserSeeder] })`

**Don't:**
- Use `ctx.req.valid('json')` — use `ctx.body<T>()` which returns pre-validated data
- Import `zod` directly — use `stratal/validation` (OpenAPI compatibility layer)
- Import Better Auth directly — use `AuthService` wrapper and `wrapBetterAuth()`
- Register providers outside of modules — always use `@Module({ providers: [...] })`
- Forget the `CACHE` KV binding in `wrangler.jsonc` when using `CacheService`
- Forget `casbinRule` model in ZenStack schema when using RbacModule

> [!reference] For project setup (wrangler.jsonc, tsconfig, env typing), see [project-setup.md](references/project-setup.md)
