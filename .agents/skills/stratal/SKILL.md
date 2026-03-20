---
name: stratal
description: >-
  Use when working with the Stratal core framework for Cloudflare Workers — modules,
  dependency injection, controllers, routing, OpenAPI, queues, cron, email, storage,
  caching, i18n, logging, guards, middleware, config, events, SSE, streaming, seeders,
  Quarry CLI, commands, and error handling.
  Trigger on: stratal, Stratal, StratalWorker, @Module, @Controller, @Route, IController,
  RouterContext, @inject, Scope, @Listener, @On, queues, cron, email, storage, cache,
  i18n, logging, guards, middleware, config, OpenAPIModule, ConfigModule, CacheModule,
  EmailModule, StorageModule, QueueModule, I18nModule, ApplicationError, StratalEnv,
  registerAs, StratalDurableObject, StratalWorkerEntrypoint, StratalWorkflow, runInScope,
  stratal/workers, DurableObject, Workflow, WorkerEntrypoint, Service Binding, RPC,
  @Get, @Post, @Put, @Patch, @Delete, @All, HttpRouteMetadata, RouteConfig,
  versioning, VERSION_NEUTRAL, VersioningOptions, defaultVersion, version prefix, API versioning,
  RouteBody, RouteBodyObject, RouteResponse, RouteResponseObject, contentType, content type,
  multipart/form-data, application/octet-stream, DEFAULT_CONTENT_TYPE,
  @Gateway, @OnMessage, @OnClose, @OnError, GatewayContext, WebSocket, websocket, gateway,
  stratal/websocket, streamSSE, SSEStreamingApi, SSEMessage, StreamingApi, stream, streamText,
  text/event-stream, SSE, streaming, Server-Sent Events,
  Seeder, SeederRegistry, stratal/seeder, db:seed, quarry, Quarry, Command, QuarryRegistry,
  stratal/quarry, QuarryRunner, npx quarry.
user-invocable: false
license: MIT
metadata:
  author: Temitayo Fadojutimi
  version: "3.1"
---

# Stratal Core Framework

Stratal is a modular Cloudflare Workers framework with dependency injection (tsyringe), Hono-based routing with OpenAPI generation, queue consumers, cron jobs, i18n, caching, storage, and email. Full documentation at [stratal.dev](https://stratal.dev).

## Key Constraints

- ESM-only (`"type": "module"`)
- Build with tsdown (powered by Rolldown/Oxc) — **never** esbuild/tsup (tsyringe requires `emitDecoratorMetadata`)
- `experimentalDecorators` and `emitDecoratorMetadata` must be enabled in tsconfig
- Always import Zod from `stratal/validation`, never from `zod` directly
- Service classes can be used directly as DI tokens (`@inject(MyService)`). Only create Symbol tokens when the service needs to be replaceable or is part of a reusable library
- Use constructor injection with `@inject()` decorators

## Project Setup

Docs: [Installation](https://stratal.dev/getting-started/installation) · [Your First Worker](https://stratal.dev/getting-started/your-first-worker)

```ts
// src/index.ts — Worker entry point
import { Stratal } from 'stratal';
import { AppModule } from './app.module';

// Without versioning
const app = new Stratal({ module: AppModule });

// With URI-based API versioning
const app = new Stratal({
  module: AppModule,
  versioning: { prefix: 'v', defaultVersion: '1' },
});

export default app;
```

## Modules

Docs: [Modules](https://stratal.dev/core-concepts/modules) · [Lifecycle Hooks](https://stratal.dev/core-concepts/lifecycle-hooks)

```ts
@Module({
  imports: [OtherModule],
  providers: [MyService],
  controllers: [MyController],
  consumers: [MyConsumer],
  jobs: [MyCronJob],
})
export class AppModule implements OnInitialize {
  onInitialize(ctx: ModuleContext) { /* setup logic */ }
}
```

Dynamic modules use `forRoot()` (sync) or `forRootAsync()` (async factory). Lifecycle hooks: `OnInitialize`, `OnShutdown`.

## Controllers and Routing

Docs: [Controllers & Routing](https://stratal.dev/core-concepts/controllers-and-routing) · [OpenAPI](https://stratal.dev/openapi/overview)

```ts
@Controller('/api/v1/users', { tags: ['Users'] })
export class UsersController implements IController {
  constructor(@inject(UsersService) private usersService: UsersService) {}

  @Route({ body: CreateUserSchema, response: UserSchema })
  async create(ctx: RouterContext) {
    const data = await ctx.body<CreateUserInput>();
    return ctx.json(await this.usersService.create(data));
  }
}
```

**Method → HTTP mapping (convention-based):** `index` → GET, `show` → GET /:id, `create` → POST (201), `update` → PUT /:id, `patch` → PATCH /:id, `destroy` → DELETE /:id.

Use `await ctx.body<T>()` to get validated body — **not** `ctx.req.valid('json')`.

### HTTP Method Decorators

As an alternative to convention-based `@Route()`, use explicit HTTP method decorators for full control over method and path:

```ts
import { Controller, Get, Post, All } from 'stratal/router';

@Controller('/api/v1/users', { tags: ['Users'] })
export class UsersController implements IController {
  constructor(@inject(UsersService) private usersService: UsersService) {}

  @Get('/', { response: UsersListSchema })
  async list(ctx: RouterContext) {
    return ctx.json(await this.usersService.findAll());
  }

  @Post('/', { body: CreateUserSchema, response: UserSchema, statusCode: 201 })
  async create(ctx: RouterContext) {
    const data = await ctx.body<CreateUserInput>();
    return ctx.json(await this.usersService.create(data), 201);
  }

  @Get('/:id', { params: z.object({ id: z.string().uuid() }), response: UserSchema })
  async show(ctx: RouterContext) {
    const { id } = ctx.params<{ id: string }>();
    return ctx.json(await this.usersService.findById(id));
  }

  @All('/:path{.+}', { response: z.object({ message: z.string() }) })
  async catchAll(ctx: RouterContext) {
    return ctx.json({ message: 'Not found' }, 404);
  }
}
```

**Available decorators:** `@Get(path, config?)`, `@Post(path, config?)`, `@Put(path, config?)`, `@Patch(path, config?)`, `@Delete(path, config?)`, `@All(path, config?)`.

**`RouteConfig` options:** `body`, `params`, `query`, `response` (required), `tags`, `security`, `description`, `summary`, `statusCode`, `hideFromDocs`.

**Custom content types:** `body` and `response` accept an object form with optional `contentType` (defaults to `application/json`):

```ts
@Route({
  body: { schema: UploadSchema, contentType: 'multipart/form-data' },
  response: { schema: FileSchema, contentType: 'application/octet-stream', description: 'Binary file' },
})
async upload(ctx: RouterContext) { /* ... */ }
```

Types: `RouteBody = ZodType | RouteBodyObject`, `RouteResponse = ZodType | RouteResponseObject`. Error responses always use `application/json` regardless of route content type.

**Key rules:**
- HTTP method decorators and `@Route()` **cannot be mixed** in the same controller — use one pattern or the other
- Default status code is `200` for all methods; use `statusCode: 201` explicitly for POST create endpoints
- `@All` routes are **automatically hidden** from OpenAPI docs (OpenAPI doesn't support catch-all HTTP methods)

## WebSocket Gateways

Docs: [WebSocket](https://stratal.dev/integrations/websocket)

Use `@Gateway(path, options?)` to create WebSocket endpoints. Gateways are registered in the module's `controllers` array (not a separate array). The `@Gateway` decorator auto-applies `@Transient()`. Accepts optional `GatewayOptions` (from `stratal/websocket`) with `version` support — same as `@Controller`.

```ts
import { Gateway, OnMessage, OnClose, OnError } from 'stratal/websocket';
import type { GatewayContext } from 'stratal/websocket';

@Gateway('/ws/chat', { version: '1' })
export class ChatGateway {
  constructor(@inject(ChatService) private chatService: ChatService) {}

  @OnMessage()
  handleMessage(evt: MessageEvent, ctx: GatewayContext) {
    ctx.send(`echo:${evt.data as string}`);
  }

  @OnClose()
  handleClose(evt: CloseEvent, ctx: GatewayContext) {
    console.log('Connection closed');
  }

  @OnError()
  handleError(evt: Event, ctx: GatewayContext) {
    console.error('WebSocket error', evt);
  }
}
```

```ts
@Module({
  controllers: [ChatGateway], // gateways go in controllers array
  providers: [ChatService],
})
export class ChatModule {}
```

**Method decorators:** `@OnMessage()`, `@OnClose()`, `@OnError()` — each marks exactly one method per gateway.

**`GatewayContext`** extends `RouterContext` with:
- `send(data)` — send a string, ArrayBuffer, or Uint8Array through the WebSocket
- `close(code?, reason?)` — close the WebSocket connection
- `readyState` — current WebSocket ready state
- `ws` — raw Hono `WSContext`
- Inherits `header()`, `getContainer()`, `getLocale()` from `RouterContext`
- Overrides `param()` and `query()` to use raw Hono request methods (no OpenAPI validation, since WebSocket upgrades bypass OpenAPI)
- `body()` throws `WebSocketBodyNotAvailableError` — WebSocket upgrade requests have no body

**Guards** work on the upgrade request via `@UseGuards()` — applied the same way as on controllers.

**Note:** Hono's `onOpen` event is not supported on Cloudflare Workers (the connection is already open when the server receives it).

## Streaming & SSE

Docs: [Streaming](https://stratal.dev/core-concepts/streaming)

`RouterContext` provides three streaming methods that wrap Hono's streaming utilities:

### `ctx.stream()` — Generic/binary streaming

```ts
@Get('/download', { response: { schema: z.any(), contentType: 'application/octet-stream' } })
async download(ctx: RouterContext) {
  return ctx.stream(async (stream) => {
    await stream.write(new Uint8Array([1, 2, 3]));
    await stream.close();
  });
}
```

**Signature:** `stream(callback: (stream: StreamingApi) => Promise<void>, onError?: (err: Error, stream: StreamingApi) => Promise<void>): Response`

### `ctx.streamText()` — Text streaming

Automatically sets `Content-Encoding: Identity` for Cloudflare Workers compatibility.

```ts
@Get('/generate', { response: { schema: z.any(), contentType: 'text/plain' } })
async generate(ctx: RouterContext) {
  return ctx.streamText(async (stream) => {
    await stream.write('Hello ');
    await stream.write('World');
    await stream.close();
  });
}
```

**Signature:** `streamText(callback: (stream: StreamingApi) => Promise<void>, onError?: (err: Error, stream: StreamingApi) => Promise<void>): Response`

### `ctx.streamSSE()` — Server-Sent Events

Automatically sets `Content-Encoding: Identity` for Cloudflare Workers compatibility.

```ts
import type { SSEStreamingApi } from 'stratal/router';

@Get('/events', { response: { schema: z.any(), contentType: 'text/event-stream' } })
async events(ctx: RouterContext) {
  return ctx.streamSSE(async (stream) => {
    await stream.writeSSE({ data: JSON.stringify({ status: 'connected' }), event: 'open', id: '1' });
    await stream.writeSSE({ data: JSON.stringify({ message: 'hello' }), event: 'message', id: '2' });
  });
}
```

**Signature:** `streamSSE(callback: (stream: SSEStreamingApi) => Promise<void>, onError?: (err: Error, stream: SSEStreamingApi) => Promise<void>): Response`

**SSE message format:** `writeSSE({ data: string, event?: string, id?: string })` — the `data` field is required, `event` and `id` are optional.

**Exported types from `stratal/router`:** `SSEStreamingApi`, `SSEMessage`, `StreamingApi`.

## API Versioning

Docs: [API Versioning](https://stratal.dev/core-concepts/versioning/)

Stratal supports URI-based API versioning. Enable it via `Stratal` config:

```ts
import { Stratal } from 'stratal';

const app = new Stratal({
  module: AppModule,
  versioning: { prefix: 'v', defaultVersion: '1' },
});
```

**Controller-level version:**

```ts
import { Controller, VERSION_NEUTRAL } from 'stratal/router';

// Single version — routes served at /v1/users
@Controller('/users', { version: '1' })
export class UsersV1Controller implements IController { /* ... */ }

// Multiple versions — routes served at both /v1/users and /v2/users
@Controller('/users', { version: ['1', '2'] })
export class UsersController implements IController { /* ... */ }

// Version-neutral — routes served at /health (no version prefix)
@Controller('/health', { version: VERSION_NEUTRAL })
export class HealthController implements IController { /* ... */ }
```

**`defaultVersion` behavior:** When `defaultVersion` is set (e.g., `'1'`), controllers without an explicit `version` option are automatically assigned that version. Controllers with `VERSION_NEUTRAL` are not affected — they always remain unversioned.

**Middleware version targeting:**

```ts
export class AppModule implements MiddlewareConfigurable {
  configure(consumer: MiddlewareConsumer) {
    // Target middleware to a specific API version
    consumer.apply(V1DeprecationMiddleware).forRoutes({ path: '/users', version: '1' });
  }
}
```

## Dependency Injection

Docs: [DI](https://stratal.dev/core-concepts/dependency-injection) · [Providers](https://stratal.dev/core-concepts/providers)

```ts
// Simple: use class directly as token
@Transient()
export class UsersService { /* ... */ }
// inject with: @inject(UsersService)

// Symbol tokens — only for replaceable abstractions
const USER_REPO = Symbol.for('UserRepository');
@Module({
  providers: [
    { provide: USER_REPO, useClass: PgUserRepository, scope: Scope.Request },
  ],
})
```

| Scope | Behavior |
|---|---|
| `Scope.Transient` | New instance per resolution (default) |
| `Scope.Singleton` | Single instance globally |
| `Scope.Request` | New instance per HTTP request |

**Provider types:** `useClass`, `useValue`, `useFactory` (with `inject` array), `useExisting`.

## StratalEnv Augmentation

Docs: [Environment Typing](https://stratal.dev/guides/environment-typing)

```ts
// 1. Generate wrangler types: npx wrangler types
// 2. Extend StratalEnv with Cloudflare.Env:
export {};

declare module 'stratal' {
  interface StratalEnv extends Cloudflare.Env {}
}
```

Run `npx wrangler types` to generate `Cloudflare.Env` from your `wrangler.jsonc` bindings.

## Guards and Middleware

Docs: [Guards](https://stratal.dev/guides/guards) · [Middleware](https://stratal.dev/guides/middleware)

```ts
// Guard — implements CanActivate
@Transient()
export class ApiKeyGuard implements CanActivate {
  constructor(@inject(DI_TOKENS.CloudflareEnv) private env: StratalEnv) {}
  canActivate(ctx: RouterContext): boolean {
    return ctx.header('x-api-key') === this.env.API_KEY;
  }
}
// Apply with @UseGuards(ApiKeyGuard) on controller or method
```

```ts
// Middleware class — implements Middleware
@Transient()
export class LoggingMiddleware implements Middleware {
  async handle(ctx: RouterContext, next: () => Promise<void>) {
    console.log(`--> ${ctx.c.req.method} ${ctx.c.req.path}`);
    await next();
  }
}
```

```ts
// Middleware registration — module implements MiddlewareConfigurable
export class AppModule implements MiddlewareConfigurable {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes('*');
    consumer.apply(CorsMiddleware).exclude('/health').forRoutes(ApiController);
  }
}
```

## Configuration

Docs: [Configuration](https://stratal.dev/core-concepts/configuration)

```ts
const databaseConfig = registerAs('database', (env: StratalEnv) => ({
  url: env.DATABASE_URL,
  poolSize: 10,
}));

@Module({ providers: [databaseConfig.asProvider()] })
export class AppModule {}
// Inject with: @inject(databaseConfig.KEY) config: { url: string; poolSize: number }
```

## Events

Docs: [Events](https://stratal.dev/core-concepts/events)

```ts
@Listener()
export class UserCreatedListener {
  @On('after.User.create')
  async sendWelcomeEmail(context: EventContext<'after.User.create'>) {
    // handle event
  }
}
```

Augment `CustomEventRegistry` for type-safe custom events. Options: `priority` (number), `blocking` (boolean).

## Error Handling

Docs: [Error Handling](https://stratal.dev/guides/error-handling)

```ts
import { ApplicationError, ERROR_CODES } from 'stratal/errors';

export class UserNotFoundError extends ApplicationError {
  constructor(userId: string) {
    super('errors.userNotFound', ERROR_CODES.RESOURCE.NOT_FOUND, { userId });
  }
}
```

`ApplicationError` provides structured JSON responses with i18n message keys, numeric error codes (from `ERROR_CODES`), and metadata.

## Queue Consumers

Docs: [Queues](https://stratal.dev/integrations/queues)

```ts
@Transient()
export class EmailConsumer implements IQueueConsumer<EmailPayload> {
  readonly messageTypes = ['email.send'];

  async handle(message: QueueMessage<EmailPayload>) {
    // process message.payload
  }
}
```

Register in module `consumers` array. Messages have `id`, `type`, `payload`, and optional `metadata`.

## Cron Jobs

Docs: [Cron Jobs](https://stratal.dev/integrations/cron-jobs)

```ts
@Transient()
export class CleanupJob implements CronJob {
  readonly schedule = '0 2 * * *';

  async execute(controller: ScheduledController) {
    // runs daily at 2 AM UTC
  }
}
```

Register in module `jobs` array. Schedule must match a trigger in `wrangler.jsonc`.

## Seeders

Docs: [Seeders](https://stratal.dev/integrations/seeders)

```ts
import { Seeder } from 'stratal/seeder';

export class UsersSeeder extends Seeder {
  constructor(@inject(UsersService) private usersService: UsersService) {}

  async run(): Promise<void> {
    await this.usersService.create({ name: 'Admin', email: 'admin@example.com' });
    // Call another seeder (like Laravel's $this->call())
    await this.call(RolesSeeder);
  }
}
```

Register seeders in the module's `providers` array — they are auto-discovered from any class extending `Seeder`. Seeders execute within request-scoped DI containers, so they have full access to injected services.

Run seeders via the Quarry CLI: `npx quarry db:seed UsersSeeder`, `npx quarry db:seed --all`, `npx quarry db:seed:list`.

## Quarry CLI

Docs: [Quarry CLI](https://stratal.dev/integrations/quarry)

`Command` abstract base class with Laravel-style signature parsing for arguments, options, and flags.

```ts
import { Command } from 'stratal/quarry';

export class GreetCommand extends Command {
  static command = 'greet {name : The name to greet} {--loud}';
  static description = 'Greet someone';

  async handle(): Promise<void> {
    const name = this.string('name');
    const loud = this.boolean('loud');
    this.info(loud ? `HELLO, ${name.toUpperCase()}!` : `Hello, ${name}!`);
  }
}
```

Register commands in the module's `providers` array — they are auto-discovered from any class extending `Command`. Commands execute within request-scoped DI containers.

**CLI entry:** `npx quarry` imports the app's default `Stratal` export from `src/index.ts`. Override entry path: `npx quarry ./custom/entry.ts <command>`.

**Built-in commands:** `list`, `help <command>`, `db:seed {name?} {--all}`, `db:seed:list`.

## Workers

Docs: [Durable Objects](https://stratal.dev/integrations/durable-objects) · [Service Bindings](https://stratal.dev/integrations/service-bindings) · [Workflows](https://stratal.dev/integrations/workflows)

Stratal provides base classes for Cloudflare Workers primitives (Durable Objects, Service Bindings/RPC, Workflows) with built-in DI support. Each class exposes a `runInScope()` method that creates a request-scoped DI container from the static Stratal singleton.

```ts
// src/index.ts — MUST export Stratal as default + worker classes as named exports
export { Counter } from './counter';
export { AuthRpc } from './auth-rpc';
export { MyWorkflow } from './my-workflow';
export default new Stratal({ module: AppModule });
```

### StratalDurableObject

Extends `DurableObject`. `runInScope` auto-registers `DI_TOKENS.DurableObjectState` and `DI_TOKENS.DurableObjectId`.

```ts
export class Counter extends StratalDurableObject {
  async increment() {
    return this.runInScope(async (container) => {
      const counterService = container.resolve<CounterService>(CounterService)

      counterService.increment();
    });
  }
}
```

### StratalWorkerEntrypoint

Extends `WorkerEntrypoint` for RPC / Service Bindings.

```ts
export class AuthRpc extends StratalWorkerEntrypoint {
  async verifyToken(token: string) {
    return this.runInScope(async (container) => {
      const auth = container.resolve(AuthService);
      return auth.verify(token);
    });
  }
}
```

### StratalWorkflow

Extends `WorkflowEntrypoint` with generic `Env` and `Params` types.

```ts
export class MyWorkflow extends StratalWorkflow<Env, { orderId: string }> {
  async run(event: WorkflowEvent<{ orderId: string }>, step: WorkflowStep) {
    await step.do('process', () =>
      this.runInScope(async (container) => {
        const svc = container.resolve(OrderService);
        return svc.validate(event.payload.orderId);
      })
    );
  }
}
```

## Built-in Modules Quick Reference

| Module | Import | Docs |
|---|---|---|
| `CacheModule` | `stratal/cache` | [Caching](https://stratal.dev/integrations/caching) |
| `EmailModule` | `stratal/email` | [Email](https://stratal.dev/integrations/email) |
| `StorageModule` | `stratal/storage` | [Storage](https://stratal.dev/integrations/storage) |
| `I18nModule` | `stratal/i18n` | [i18n](https://stratal.dev/integrations/i18n) |
| `OpenAPIModule` | `stratal/openapi` | [OpenAPI](https://stratal.dev/openapi/overview) |
| `LoggerService` | `stratal/logger` | [Logging](https://stratal.dev/integrations/logging) |
| `ConfigModule` | `stratal/config` | [Configuration](https://stratal.dev/core-concepts/configuration) |
| `QueueModule` | `stratal/queue` | [Queues](https://stratal.dev/integrations/queues) |

## Sub-path Imports

| Path | Key Exports |
|---|---|
| `stratal` | `Stratal`, `Application`, `@Module`, `StratalEnv` |
| `stratal/di` | `Container`, `DI_TOKENS`, `Scope`, `inject`, `Transient` |
| `stratal/router` | `@Controller`, `@Route`, `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`, `@All`, `RouteConfig`, `RouteBody`, `RouteBodyObject`, `RouteResponse`, `RouteResponseObject`, `RouterContext`, `UseGuards`, `IController`, `VERSION_NEUTRAL`, `VersioningOptions`, `SSEStreamingApi`, `SSEMessage`, `StreamingApi` |
| `stratal/validation` | `z` (Zod), `ZodType`, validation utilities |
| `stratal/errors` | `ApplicationError`, `ERROR_CODES`, built-in error classes |
| `stratal/events` | `@Listener`, `@On`, `EventRegistry` |
| `stratal/i18n` | `I18nModule`, `I18nService` |
| `stratal/cache` | `CacheModule`, `CacheService` |
| `stratal/email` | `EmailModule`, `EmailService` |
| `stratal/storage` | `StorageModule`, `StorageService` |
| `stratal/queue` | `QueueModule`, `QueueService`, `IQueueConsumer` |
| `stratal/logger` | `LoggerService`, `LOGGER_TOKENS` |
| `stratal/config` | `ConfigModule`, `registerAs` |
| `stratal/openapi` | `OpenAPIModule` |
| `stratal/websocket` | `@Gateway`, `@OnMessage`, `@OnClose`, `@OnError`, `GatewayContext` |
| `stratal/seeder` | `Seeder`, `SeederRegistry`, `SEEDER_TOKENS` |
| `stratal/quarry` | `Command`, `QuarryRegistry`, `parseSignature` |
| `stratal/workers` | `StratalDurableObject`, `StratalWorkerEntrypoint`, `StratalWorkflow`, `runInScope` |

## Do's and Don'ts

- **Do** use class references as DI tokens for simple services (`@inject(MyService)`)
- **Do** use Symbol tokens only for replaceable abstractions or reusable libraries
- **Do** use `await ctx.body<T>()` for validated request bodies
- **Do** import Zod from `stratal/validation`
- **Do** use constructor injection with `@inject()`
- **Do** add `@Transient()` to consumers, jobs, guards, middleware, and listeners
- **Do** register consumers in `consumers` and jobs in `jobs` arrays
- **Don't** use esbuild or tsup — only tsdown (powered by Rolldown/Oxc)
- **Don't** use `ctx.req.valid('json')` — use `await ctx.body<T>()`
- **Don't** import Zod from `zod` directly
- **Do** export the `Stratal` instance as the default export (required for the static singleton used by worker classes)
- **Do** use `runInScope` for each method/workflow step that needs DI — each call gets a fresh request-scoped container
- **Don't** cache container references across `runInScope` calls — the container is only valid within the callback
- **Do** use separate controllers for different API versions when behavior diverges
- **Do** use `VERSION_NEUTRAL` for version-agnostic endpoints (health checks, OpenAPI docs, etc.)
- **Don't** mix versioned and unversioned controllers for the same path without `VERSION_NEUTRAL`
- **Do** register gateways in the `controllers` array (not a separate array)
- **Don't** mix `@Gateway` with `@Controller` on the same class
- **Don't** disable `emitDecoratorMetadata` in tsconfig
