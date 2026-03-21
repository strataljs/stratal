# Middleware & Guards

## Middleware

### MiddlewareConfigurable Interface

Modules implement `MiddlewareConfigurable` to configure middleware via a fluent API:

```typescript
import { Module } from 'stratal/module'
import type { MiddlewareConfigurable, MiddlewareConsumer } from 'stratal/module'

@Module({ providers: [LoggingMiddleware] })
export class AppModule implements MiddlewareConfigurable {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(LoggingMiddleware)
      .exclude('/health')
      .forRoutes('*')
  }
}
```

### Middleware Consumer API

```typescript
consumer
  .apply(MiddlewareClass)         // Middleware to apply
  .apply(First, Second, Third)    // Multiple middleware (executed in order)
  .exclude('/health', '/metrics') // Exclude paths
  .forRoutes('*')                 // Apply to all routes
  .forRoutes('/api/v1/users')     // Apply to specific path
  .forRoutes({ path: '/api', method: 'GET' })  // Path + method
```

### Middleware Interface

Middleware classes must implement the `Middleware` interface from `stratal/router`:

```typescript
import { Transient, inject } from 'stratal/di'
import type { Middleware, RouterContext } from 'stratal/router'

@Transient()
export class LoggingMiddleware implements Middleware {
  async handle(ctx: RouterContext, next: () => Promise<void>): Promise<void> {
    console.log(`${ctx.c.req.method} ${ctx.c.req.url}`)
    await next()
    console.log(`Response: ${ctx.c.res.status}`)
  }
}
```

## Guards

Guards run after middleware but before route handlers. They decide if a request should proceed.

### CanActivate Interface

```typescript
import type { CanActivate, RouterContext } from 'stratal/router'
import { Transient, inject } from 'stratal/di'

@Transient()
export class RoleGuard implements CanActivate {
  constructor(
    @inject(AUTH_TOKENS.AuthContext) private readonly authContext: AuthContext,
  ) {}

  async canActivate(context: RouterContext): Promise<boolean> {
    // Return true to allow, false to deny (403)
    return this.authContext.hasRole('admin')
  }
}
```

Guards use constructor injection — they are resolved from the request-scoped DI container, so they have access to request-scoped services like `AuthContext`.

### @UseGuards Decorator

Apply guards at controller or method level:

```typescript
import { UseGuards } from 'stratal/router'

// Controller-level — all routes protected
@Controller('/api/v1/admin')
@UseGuards(AuthGuard())
export class AdminController { ... }

// Method-level — only this route protected
@Controller('/api/v1/notes')
export class NotesController {
  @UseGuards(AuthGuard())
  @Route({ body: createNoteSchema, response: noteSchema })
  async create(ctx: RouterContext) { ... }

  // No guard — public
  @Route({ response: z.array(noteSchema) })
  async index(ctx: RouterContext) { ... }
}
```

### Guard Types

Guards can be:
- **Class constructors** — resolved from DI container (constructor injection available)
- **Instances** — pre-configured (from factory functions like `AuthGuard()`)

```typescript
// Class guard (resolved from DI, constructor injection works)
@UseGuards(RoleGuard)

// Instance guard (factory-created with config)
@UseGuards(AuthGuard({ scopes: ['admin:read'] }))

// Multiple guards (all must pass)
@UseGuards(AuthGuard(), RateLimitGuard)
```

### AuthGuard (Framework)

Factory function from `@stratal/framework/guards`:

```typescript
import { AuthGuard } from '@stratal/framework/guards'

// Authentication only
AuthGuard()

// Authentication + authorization
AuthGuard({ scopes: ['users:read', 'users:write'] })
```

Options:
- `scopes?: string[]` — Required permissions. If provided, checks `CasbinService.hasAnyPermission()` after authentication.

### Guard Execution Order

1. Middleware runs first (via `configure()`)
2. Guards run next (via `@UseGuards()`)
3. Route handler runs last (if all guards return `true`)

Controller-level guards run before method-level guards. If any guard returns `false`, a 403 Forbidden response is returned.
