# Stratal

<p align="center">
  <img src="media/banner.png" alt="Stratal" width="600" />
</p>

A modular Cloudflare Workers framework with automatic OpenAPI documentation, dependency injection, queue consumers, cron jobs, and type-safe configuration.

[![npm version](https://img.shields.io/npm/v/stratal)](https://www.npmjs.com/package/stratal)
[![CI](https://github.com/strataljs/stratal/actions/workflows/ci.yml/badge.svg)](https://github.com/strataljs/stratal/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Features

- **OpenAPI Documentation** — Define Zod schemas once and get a full OpenAPI 3.0 spec with Scalar docs UI, auto-derived HTTP methods and status codes, error schemas, and security definitions
- **Dependency Injection** — Two-tier DI container (global + request-scoped) powered by tsyringe with Symbol-based tokens
- **Modular Architecture** — NestJS-style `@Module()` decorator pattern with lifecycle hooks, dynamic modules, and middleware configuration
- **Hono Routing** — Convention-based RESTful controllers with `@Controller` and `@Route` decorators, auto-mapped to HTTP methods
- **Queue Consumers** — Typed Cloudflare Queue consumers with message-type filtering
- **Cron Jobs** — Scheduled tasks via Cloudflare Workers cron triggers
- **Storage** — S3-compatible file storage with presigned URLs and TUS upload support
- **Email** — Resend and SMTP providers with React Email template support
- **Internationalization** — Type-safe i18n with locale detection from request headers
- **Guards & Middleware** — Route protection with guard decorators and per-module middleware configuration

## Installation

```bash
npm install stratal
# or
yarn add stratal
```

### Optional dependencies

Stratal keeps heavy integrations optional. Install only what you need:

```bash
# Storage (S3-compatible)
npm install @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/s3-request-presigner

# Email (Resend provider)
npm install resend react react-dom @react-email/components

# Email (SMTP provider)
npm install nodemailer

# File uploads (TUS protocol)
npm install @tus/server
```

## Quick Start

### 1. Define a module

```typescript
import { Module } from 'stratal'

const TOKENS = {
  GreetingService: Symbol('GreetingService'),
}

class GreetingService {
  greet(name: string) {
    return `Hello, ${name}!`
  }
}

@Module({
  providers: [
    { provide: TOKENS.GreetingService, useClass: GreetingService },
  ],
})
export class GreetingModule {}
```

### 2. Create the root module

```typescript
import { Module } from 'stratal'
import { GreetingModule } from './greeting.module'

@Module({
  imports: [GreetingModule],
})
export class AppModule {}
```

### 3. Create the worker entry point

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

## OpenAPI Documentation

Stratal generates a full OpenAPI 3.0 specification from your Zod schemas and controller conventions. Routes get HTTP methods, paths, and success status codes automatically — you just define the schemas.

### Setup

Import `OpenAPIModule` in your root module:

```typescript
import { Module } from 'stratal'
import { OpenAPIModule } from 'stratal'

@Module({
  imports: [
    OpenAPIModule.forRoot({
      info: { title: 'My API', version: '1.0.0', description: 'My app API' },
      jsonPath: '/api/openapi.json',  // default
      docsPath: '/api/docs',          // default
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    }),
  ],
})
export class AppModule {}
```

This gives you two endpoints out of the box:

| Endpoint | Description |
|---|---|
| `/api/docs` | Interactive Scalar docs UI |
| `/api/openapi.json` | Raw OpenAPI 3.0 JSON spec |

### How It Works

Controller method names map to HTTP methods, paths, and status codes automatically:

| Method name | HTTP method | Path | Status code |
|---|---|---|---|
| `index` | GET | `/` | 200 |
| `show` | GET | `/:id` | 200 |
| `create` | POST | `/` | 201 |
| `update` | PUT | `/:id` | 200 |
| `patch` | PATCH | `/:id` | 200 |
| `destroy` | DELETE | `/:id` | 200 |

### Controller Tags & Security

Use `@Controller` options to set default tags and security for all routes. Route-level tags are merged with controller-level tags:

```typescript
import { Controller, Route } from 'stratal/router'
import { z } from 'stratal/validation'

@Controller('/api/users', {
  tags: ['Users'],
  security: ['bearerAuth'],
})
class UsersController {
  @Route({
    summary: 'List users',
    response: z.array(UserSchema),
    tags: ['Admin'],  // merged → ['Users', 'Admin']
  })
  async index(ctx: RouterContext) {
    return ctx.json(users)
  }

  @Route({
    summary: 'Create user',
    body: CreateUserSchema,
    response: UserSchema,
    security: [],  // override → public route (no auth)
  })
  async create(ctx: RouterContext) {
    const data = ctx.req.valid('json')
    return ctx.json(newUser, 201)
  }
}
```

Built-in security scheme identifiers: `bearerAuth`, `apiKey`, `sessionCookie`.

### Hiding Routes

Hide routes from the generated documentation at the controller or route level. Hidden routes remain fully functional:

```typescript
// Hide all routes in a controller
@Controller('/api/internal', { hideFromDocs: true })
class InternalController { /* ... */ }

// Hide a single route
@Route({ response: HealthSchema, hideFromDocs: true })
async healthCheck(ctx: RouterContext) { /* ... */ }
```

### Async Configuration

Use `forRootAsync` when your OpenAPI config depends on injected services:

```typescript
OpenAPIModule.forRootAsync({
  useFactory: (configService) => ({
    info: {
      title: configService.get('API_TITLE'),
      version: configService.get('API_VERSION'),
    },
  }),
  inject: [CONFIG_TOKEN],
})
```

## Core Concepts

### Modules

Modules are self-contained units that encapsulate a specific domain or feature. Each module can:

- Register providers (services) in the DI container
- Import other modules
- Declare controllers for HTTP routing
- Register queue consumers for async processing
- Register cron jobs for scheduled tasks
- Configure middleware

```typescript
@Module({
  imports: [OtherModule],
  providers: [MyService, MyRepository],
  controllers: [MyController],
  consumers: [MyEventConsumer],
  jobs: [MyScheduledJob],
})
export class MyModule {}
```

### Dependency Injection

Services use constructor injection via tsyringe with Symbol tokens:

```typescript
import { injectable, inject } from 'stratal/di'

@injectable()
class OrderService {
  constructor(
    @inject(TOKENS.UserService) private userService: UserService,
    @inject(TOKENS.NotificationService) private notifications: NotificationService,
  ) {}
}
```

### Dynamic Modules

Modules can accept configuration via `withRoot` (synchronous) or `withRootAsync` (factory-based):

```typescript
@Module({ providers: [] })
export class StorageModule {
  static withRoot(options: StorageOptions): DynamicModule {
    return {
      module: StorageModule,
      providers: [
        { provide: STORAGE_TOKEN, useValue: options },
      ],
    }
  }
}

// Usage
@Module({
  imports: [
    StorageModule.withRoot({ bucket: 'my-bucket' }),
  ],
})
export class AppModule {}
```

### Routing

Hono-based routing with automatic [OpenAPI documentation](#openapi-documentation). Controllers are auto-discovered from modules. Method names determine the HTTP method, path suffix, and success status code:

```typescript
import { Controller, Route } from 'stratal/router'
import { z } from 'stratal/validation'

@Controller('/api/users', { tags: ['Users'] })
class UsersController {
  // index → GET /api/users (200)
  @Route({
    summary: 'List users',
    response: z.array(UserSchema),
  })
  async index(ctx: RouterContext) {
    return ctx.json(users)
  }

  // create → POST /api/users (201)
  @Route({
    summary: 'Create user',
    body: CreateUserSchema,
    response: UserSchema,
  })
  async create(ctx: RouterContext) {
    const data = ctx.req.valid('json')
    return ctx.json(newUser, 201)
  }
}
```

See the [OpenAPI Documentation](#openapi-documentation) section for the full method-to-HTTP mapping, tags, security, and how to hide routes.

### Queue Consumers

Handle async events from Cloudflare Queues with typed consumers:

```typescript
import { Consumer } from 'stratal/queue'

@Consumer()
export class OrderCreatedConsumer implements IQueueConsumer<OrderPayload> {
  readonly queueName = 'orders' as const
  readonly messageTypes = ['order.created']

  async handle(message: QueueMessage<OrderPayload>): Promise<void> {
    // Process the order event
  }
}
```

### Cron Jobs

Schedule recurring tasks using Cloudflare Workers cron triggers:

```typescript
import { Job } from 'stratal/cron'

@Job()
export class DailyReportJob implements CronJob {
  readonly schedule = '0 0 * * *'

  async execute(): Promise<void> {
    // Generate daily report
  }
}
```

### Middleware

Configure middleware per-module using the `MiddlewareConfigurable` interface:

```typescript
@Module({ providers: [AuthMiddleware] })
export class AuthModule implements MiddlewareConfigurable {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(AuthMiddleware)
      .forRoutes('/api/*')
  }
}
```

### Lifecycle Hooks

Modules can implement lifecycle hooks for initialization and cleanup:

```typescript
@Module({ providers: [] })
export class DatabaseModule implements OnInitialize, OnShutdown {
  async onInitialize(context: ModuleContext): Promise<void> {
    // Set up database connections
  }

  async onShutdown(context: ModuleContext): Promise<void> {
    // Close connections
  }
}
```

### Guards

Protect routes with guard decorators:

```typescript
import { UseGuards } from 'stratal/guards'

@Controller('/api/admin')
@UseGuards(AuthGuard)
class AdminController {
  // All routes require authentication
}
```

### Internationalization

Type-safe i18n with locale detection:

```typescript
import { I18nModule } from 'stratal/i18n'

// Messages are auto-detected from request headers
// Access translations in services via DI
```

### Environment Typing

Stratal provides a base `StratalEnv` interface with required bindings (`ENVIRONMENT`, `CACHE`). Use TypeScript module augmentation to add your own application-specific Cloudflare bindings for full type safety:

```typescript
// src/types/env.ts
declare module 'stratal' {
  interface StratalEnv {
    DATABASE: D1Database
    NOTIFICATIONS_QUEUE: Queue
    MY_KV: KVNamespace
  }
}
```

The augmented type flows automatically through `StratalWorker<Env>`, `RouterService.fetch()`, and any service injecting `DI_TOKENS.CloudflareEnv`:

```typescript
import { StratalWorker, LogLevel } from 'stratal'

export default class Backend extends StratalWorker<Cloudflare.Env> {
  protected configure() {
    return {
      module: AppModule,
      logging: { level: LogLevel.INFO },
    }
  }
}
```

## Sub-path Exports

Import specific modules for better tree-shaking:

```typescript
import { Application, OpenAPIModule } from 'stratal' // Core + OpenAPI docs
import { Container } from 'stratal/di'               // DI container
import { RouterService } from 'stratal/router'       // Routing
import { z } from 'stratal/validation'                // Zod + OpenAPI
import { ApplicationError } from 'stratal/errors'     // Error types
import { I18nModule } from 'stratal/i18n'             // Internationalization
import { CacheModule } from 'stratal/cache'           // Caching
import { LoggerService } from 'stratal/logger'        // Logging
```

## Testing

The companion package [`@stratal/testing`](https://www.npmjs.com/package/@stratal/testing) provides test utilities, mocks, and factories for Stratal applications:

```bash
npm install -D @stratal/testing
# or
yarn add -D @stratal/testing
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to get started, development workflow, and submitting pull requests.

## License

MIT
