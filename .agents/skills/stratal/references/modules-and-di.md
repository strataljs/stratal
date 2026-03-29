# Modules & Dependency Injection

## Module Decorator

```typescript
import { Module } from 'stratal/module'
import type { ModuleOptions, DynamicModule, AsyncModuleOptions, ModuleContext } from 'stratal/module'

@Module({
  imports: [],       // Other modules or DynamicModule results
  providers: [],     // Services, repositories, listeners, seeders, commands
  controllers: [],   // Route controllers
  consumers: [],     // Queue consumers (IQueueConsumer implementations)
  jobs: [],          // Cron jobs (CronJob implementations)
})
export class MyModule {}
```

## Provider Types

### Class Provider (with optional scope)

```typescript
// Bare class — transient by default, uses class-as-token
providers: [MyService]

// Explicit class provider with Symbol token and scope
providers: [
  { provide: MY_TOKENS.MyService, useClass: MyService, scope: Scope.Singleton },
]
```

### Value Provider

```typescript
providers: [
  { provide: CONFIG_TOKEN, useValue: { apiKey: 'xxx' } },
]
```

### Factory Provider

```typescript
providers: [
  {
    provide: LOGGER_TOKENS.Transports,
    useFactory: (console) => [console],
    inject: [LOGGER_TOKENS.ConsoleTransport],
  },
]
```

### Existing Provider (alias)

```typescript
providers: [
  UserService,
  { provide: I_USER_SERVICE, useExisting: UserService },
]
```

## Scopes

```typescript
import { Scope } from 'stratal/di'

Scope.Transient  // New instance per resolution (default)
Scope.Singleton  // Single instance globally
Scope.Request    // New instance per HTTP request (child container)
```

- Use `Scope.Singleton` for stateless shared services (caches, registries)
- Use `Scope.Request` for request-specific state (auth context, current user)
- Default `Scope.Transient` for most services

## @Transient() Decorator

Every class resolved by DI must have `@Transient()`. It wraps tsyringe's `@injectable()`.

```typescript
import { Transient, inject } from 'stratal/di'

@Transient()
export class UserService {
  constructor(
    @inject(UserRepository) private repo: UserRepository,
  ) {}
}
```

Optionally pass a token: `@Transient(MY_TOKEN)` — associates the class with a DI token.

Note: `@Controller()` applies `@Transient()` automatically. Do not double-decorate.

## DI Tokens

Use class-as-token for simple cases (bare class in `providers`). Use `Symbol.for()` for shareable modules, value providers, and factory providers. Group Symbol tokens in a `tokens.ts` file:

```typescript
// domain/notes/notes.tokens.ts
export const NOTES_TOKENS = {
  NotesRepository: Symbol.for('Notes:Repository'),
  Config: Symbol.for('Notes:Config'),
} as const
```

For simple services, prefer class-as-token:

```typescript
// No tokens file needed — just use the class directly
@Module({
  providers: [NotesService, NotesRepository],
  controllers: [NotesController],
})
export class NotesModule {}

// Inject using class reference
@Transient()
export class NotesController {
  constructor(@inject(NotesService) private service: NotesService) {}
}
```

## Dynamic Modules

### Synchronous (forRoot)

```typescript
@Module({ providers: [] })
export class CacheModule {
  static forRoot(options: CacheOptions): DynamicModule {
    return {
      module: CacheModule,
      providers: [
        { provide: CACHE_TOKEN, useValue: options },
      ],
    }
  }
}

// Usage
@Module({ imports: [CacheModule.forRoot({ ttl: 3600 })] })
export class AppModule {}
```

### Asynchronous (forRootAsync)

```typescript
@Module({ providers: [] })
export class EmailModule {
  static forRootAsync(options: AsyncModuleOptions<EmailConfig>): DynamicModule {
    return {
      module: EmailModule,
      providers: [
        { provide: EMAIL_TOKEN, useFactory: options.useFactory, inject: options.inject },
      ],
    }
  }
}

// Usage — factory receives resolved dependencies
@Module({
  imports: [
    EmailModule.forRootAsync({
      inject: [CONFIG_TOKEN],
      useFactory: (config) => ({ apiKey: config.emailApiKey }),
    }),
  ],
})
export class AppModule {}
```

## Route Configuration

Modules can implement `RouteConfigurable` from `stratal/router` to configure middleware, route prefixes, domains, and grouping for their controllers. See `references/routing.md` for the full Router fluent API and `references/middleware-and-guards.md` for middleware patterns.

```typescript
import type { RouteConfigurable } from 'stratal/router'
import { Router } from 'stratal/router'

@Module({ controllers: [UsersController] })
export class UsersModule implements RouteConfigurable {
  configureRoutes(router: Router): void {
    router.prefix('/api').middleware(AuthMiddleware)
  }
}
```

## Lifecycle Hooks

```typescript
import type { OnInitialize, OnShutdown, ModuleContext } from 'stratal/module'

@Module({ providers: [MyService] })
export class MyModule implements OnInitialize, OnShutdown {
  onInitialize(ctx: ModuleContext): void {
    // Called after ALL providers are registered
    // ctx.container — DI container
    // ctx.logger — LoggerService
  }

  onShutdown(ctx: ModuleContext): void {
    // Called during application shutdown
  }
}
```

## Container API

The `Container` class wraps tsyringe with a two-tier model:

```typescript
import { Container, DI_TOKENS } from 'stratal/di'

// Resolve a service
const service = container.resolve<MyService>(MY_TOKENS.MyService)

// Register a service
container.register(MY_TOKENS.MyService, MyService, Scope.Singleton)

// Conditional registration
container
  .when(() => someCondition)
  .use(MY_TOKEN)
  .give(ImplA)
  .otherwise(ImplB)

// Service decoration (wraps existing registration)
container.extend(MY_TOKEN, (original, container) => new DecoratedService(original))
```

Global container holds singletons. Request container (child) is created per HTTP request for `Scope.Request` services.

## InjectParam Decorator

For method parameter injection (not constructor):

```typescript
import { InjectParam } from 'stratal/di'

class MyService {
  doSomething(@InjectParam(OTHER_TOKEN) other: OtherService): void {
    // ...
  }
}
```
