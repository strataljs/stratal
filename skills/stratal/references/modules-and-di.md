# Modules and Dependency Injection Reference

## Module Decorator

```typescript
import { Module, type ModuleOptions } from 'stratal/module'

@Module(options: ModuleOptions)
```

**ModuleOptions:**
```typescript
interface ModuleOptions {
  imports?: (ModuleClass | DynamicModule)[]  // Other modules to import
  providers?: Provider[]                      // Services to register in DI
  controllers?: Constructor[]                 // HTTP controllers
  consumers?: Constructor[]                   // Queue consumers
  jobs?: Constructor[]                        // Cron jobs
}
```

## Provider Types

### Class Provider (shorthand)

Use the class itself as both token and implementation:

```typescript
@Module({
  providers: [UserService],  // Equivalent to { provide: UserService, useClass: UserService }
})
```

### Class Provider (explicit)

```typescript
{ provide: TOKENS.UserService, useClass: UserService }
{ provide: TOKENS.UserService, useClass: UserService, scope: Scope.Singleton }
{ provide: TOKENS.UserService, useClass: UserService, scope: Scope.Request }
```

### Value Provider

```typescript
{ provide: TOKENS.Config, useValue: { apiUrl: 'https://api.example.com' } }
```

### Factory Provider

```typescript
{
  provide: TOKENS.DatabaseClient,
  useFactory: (config, logger) => new DatabaseClient(config.url, logger),
  inject: [TOKENS.Config, LOGGER_TOKENS.LoggerService],
}
```

### Existing (Alias) Provider

```typescript
{
  provide: TOKENS.IUserService,    // Interface token
  useExisting: UserService,         // Resolves to same instance as UserService
}
```

## Scopes

```typescript
import { Scope } from 'stratal/di'

Scope.Transient   // New instance every time container.resolve() is called (default)
Scope.Singleton   // One instance globally, reused across all resolutions
Scope.Request     // One instance per HTTP request (via child container)
```

## Container API

The `Container` class wraps tsyringe with a developer-friendly API:

### Registration Methods

```typescript
container.register(ServiceClass)                          // Class as token, Transient
container.register(ServiceClass, Scope.Singleton)         // Class as token, Singleton
container.register(TOKEN, ServiceClass)                   // Explicit token, Transient
container.register(TOKEN, ServiceClass, Scope.Request)    // Explicit token, Request-scoped

container.registerSingleton(ServiceClass)                 // Class as token
container.registerSingleton(TOKEN, ServiceClass)          // Explicit token

container.registerValue(TOKEN, value)                     // Register a pre-created instance

container.registerFactory(TOKEN, (container) => {         // Factory registration
  const config = container.resolve(CONFIG_TOKEN)
  return new MyService(config)
})

container.registerExisting(ALIAS_TOKEN, TARGET_TOKEN)     // Token alias
```

### Resolution

```typescript
const service = container.resolve<IUserService>(TOKENS.UserService)
const exists = container.isRegistered(TOKENS.UserService)
```

### Conditional Binding

Choose implementation based on a runtime predicate:

```typescript
container
  .when((c) => c.resolve(CONFIG_TOKEN).get('env') === 'development')
  .use(FORMATTER_TOKEN)
  .give(PrettyFormatter)
  .otherwise(JsonFormatter)
```

With caching (predicate evaluated once):

```typescript
container
  .when((c) => c.resolve(FEATURE_FLAGS).isEnabled('new-payment'), { cache: true })
  .use(PAYMENT_TOKEN)
  .give(StripePaymentService)
  .otherwise(LegacyPaymentService)
```

### Service Decoration (extend)

Replace a registered service with a decorated version. **Must be used in `onInitialize()`:**

```typescript
@Module({ providers: [...] })
export class MyModule implements OnInitialize {
  onInitialize({ container }: ModuleContext): void {
    container.extend(DI_TOKENS.Database, (db, c) => {
      const logger = c.resolve(LOGGER_TOKENS.LoggerService)
      return new LoggingDatabaseDecorator(db, logger)
    })
  }
}
```

### Request Scope

Automatic lifecycle management:

```typescript
await container.runInRequestScope(routerContext, async () => {
  const i18n = container.resolve(I18N_TOKENS.I18nService)
  // i18n is scoped to this request
})
```

Manual lifecycle management:

```typescript
const reqContainer = container.createRequestScope(routerContext)
await reqContainer.runWithContextStore(async () => {
  // Use reqContainer for resolutions
})
```

## Built-in DI Tokens

```typescript
import { DI_TOKENS, CONTAINER_TOKEN } from 'stratal/di'

DI_TOKENS.CloudflareEnv       // StratalEnv — Cloudflare bindings
DI_TOKENS.ExecutionContext     // ExecutionContext — Cloudflare execution context
DI_TOKENS.Container            // Container instance
DI_TOKENS.Application          // Application instance
DI_TOKENS.ModuleRegistry       // ModuleRegistry
DI_TOKENS.ErrorHandler         // GlobalErrorHandler
DI_TOKENS.ConnectionManager    // Database connection manager
DI_TOKENS.Database             // Database service
DI_TOKENS.Queue                // QueueManager
DI_TOKENS.ConsumerRegistry     // ConsumerRegistry
DI_TOKENS.Cron                 // CronManager
DI_TOKENS.EventRegistry        // EventRegistry
DI_TOKENS.AuthContext           // Auth context (userId, etc.)
```

## Dynamic Modules

### Synchronous Configuration (forRoot)

```typescript
@Module({ providers: [] })
export class FeatureModule {
  static forRoot(options: FeatureOptions): DynamicModule {
    return {
      module: FeatureModule,  // Required — preserves lifecycle methods
      providers: [
        { provide: FEATURE_TOKEN, useValue: options },
        { provide: TOKENS.FeatureService, useClass: FeatureService },
      ],
    }
  }
}

// Usage
@Module({
  imports: [FeatureModule.forRoot({ enabled: true })],
})
export class AppModule {}
```

### Async Configuration (forRootAsync)

```typescript
@Module({ providers: [] })
export class DatabaseModule {
  static forRootAsync(options: AsyncModuleOptions<DatabaseOptions>): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        {
          provide: DB_TOKEN,
          useFactory: options.useFactory,
          inject: options.inject,
        },
      ],
    }
  }
}

// Usage
@Module({
  imports: [
    DatabaseModule.forRootAsync({
      inject: [CONFIG_TOKENS.ConfigService],
      useFactory: (config) => ({
        url: config.get('database.url'),
        maxConnections: config.get('database.maxConnections'),
      }),
    }),
  ],
})
export class AppModule {}
```

**DynamicModule interface:**
```typescript
interface DynamicModule {
  module: Constructor            // Reference to module class (required)
  providers?: Provider[]
  controllers?: Constructor[]
  consumers?: Constructor[]
  jobs?: Constructor[]
}
```

## Lifecycle Hooks

Modules can implement initialization and shutdown hooks:

```typescript
import { type OnInitialize, type OnShutdown, type ModuleContext } from 'stratal/module'

interface ModuleContext {
  container: Container
  logger: LoggerService
}

@Module({ providers: [...] })
export class DatabaseModule implements OnInitialize, OnShutdown {
  async onInitialize({ container, logger }: ModuleContext): Promise<void> {
    logger.info('Initializing database connections')
    // Runs after all modules are registered, before routes are configured
  }

  async onShutdown({ container, logger }: ModuleContext): Promise<void> {
    logger.info('Closing database connections')
    // Runs during application shutdown
  }
}
```

**Initialization order:**
1. All modules registered (providers added to DI container)
2. `onInitialize()` hooks called on all modules
3. Managers resolved (ConsumerRegistry, CronManager)
4. RouterService registered
5. Routes, queues, and cron jobs configured

## Module Patterns

### Feature Module

```typescript
@Module({
  providers: [
    { provide: TOKENS.UserService, useClass: UserService },
    { provide: TOKENS.UserRepository, useClass: UserRepository },
  ],
  controllers: [UsersController],
})
export class UsersModule {}
```

### Shared Module

```typescript
@Module({
  providers: [
    { provide: TOKENS.MailService, useClass: MailService },
  ],
})
export class SharedModule {}

// Import in multiple feature modules
@Module({ imports: [SharedModule] })
export class OrdersModule {}

@Module({ imports: [SharedModule] })
export class NotificationsModule {}
```

### Configurable Module

Combine `MiddlewareConfigurable` with lifecycle hooks:

```typescript
@Module({ providers: [AuthService] })
export class AuthModule implements MiddlewareConfigurable, OnInitialize {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(AuthMiddleware)
      .exclude('/api/v1/auth/login', '/api/v1/auth/register')
      .forRoutes('*')
  }

  async onInitialize({ container, logger }: ModuleContext): Promise<void> {
    logger.info('Auth module initialized')
  }
}
```
