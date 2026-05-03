# Middleware & Guards

## Middleware

### Registering Middleware

Modules implement `RouteConfigurable` to register middleware via the Router:

```typescript
import { Module } from 'stratal/module'
import type { RouteConfigurable } from 'stratal/router'
import { Router } from 'stratal/router'

@Module({ providers: [LoggingMiddleware] })
export class AppModule implements RouteConfigurable {
  configureRoutes(router: Router): void {
    // Scoped — applies to this module's controllers
    router.middleware(LoggingMiddleware)
  }
}
```

### Common Middleware Patterns

```typescript
configureRoutes(router: Router): void {
  // Global middleware — ALL routes in the entire app
  router.use(CorsMiddleware, SecurityHeadersMiddleware)

  // Scoped middleware — only this module's controllers
  router.middleware(LoggingMiddleware)

  // Middleware for specific controllers only
  router.group([AdminController], (r) => {
    r.middleware(AdminAuthMiddleware)
  })

  // Combine with other Router options
  router.group([TenantController, BillingController], (r) => {
    r.prefix('/tenant')
      .domain('{tenant}.myapp.com')
      .middleware(TenantMiddleware)
  })
}
```

For the full Router fluent API (`.prefix()`, `.domain()`, `.name()`, `.version()`, `.group()`, `.throttle()`), see `references/routing.md`. For named rate limiters, see `references/rate-limiter.md`.

### Middleware Interface

Middleware classes implement the `Middleware` interface from `stratal/router`:

```typescript
import { Transient, inject } from 'stratal/di'
import type { Middleware, Next, RouterContext } from 'stratal/router'

@Transient()
export class LoggingMiddleware implements Middleware {
  async handle(ctx: RouterContext, next: Next): Promise<void> {
    const start = Date.now()
    console.log(`${ctx.c.req.method} ${ctx.c.req.url}`)
    await next()
    console.log(`Response: ${ctx.c.res.status} (${Date.now() - start}ms)`)
  }
}
```

Middleware can inject services via the constructor:

```typescript
@Transient()
export class IpAllowlistMiddleware implements Middleware {
  constructor(
    @inject(ALLOWLIST_TOKEN) private allowlist: IpAllowlistService,
  ) {}

  async handle(ctx: RouterContext, next: Next): Promise<Response | void> {
    if (!this.allowlist.contains(ctx.header('cf-connecting-ip'))) {
      return ctx.json({ error: 'Forbidden' }, 403)
    }
    await next()
  }
}
```

Returning a `Response` from `handle()` short-circuits the chain — the route handler is not called.

For request throttling, prefer the framework's built-in named rate limiters (`router.throttle('name')` / `@RateLimit('name')`) instead of hand-rolling middleware — see `references/rate-limiter.md`.

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
@UseGuards(AuthGuard({ permissions: 'admin:access' }))

// Multiple guards (all must pass)
@UseGuards(AuthGuard(), RateLimitGuard)
```

### AuthGuard (Framework)

Factory function from `@stratal/framework/guards`:

```typescript
import { AuthGuard } from '@stratal/framework/guards'

// Authentication only
AuthGuard()

// Authentication + single permission
AuthGuard({ permissions: 'posts:update' })

// Authentication + any one of these permissions
AuthGuard({ permissions: ['posts:update', 'posts:delete'] })

// Wildcard — any action on the resource
AuthGuard({ permissions: 'posts' })
```

Options:
- `permissions?: string | string[]` — Required permissions in `"resource:action"` format. If provided, checks `AccessService` after authentication. Permission check reads from `AuthContext` (no DB hit).

### Guard Execution Order

1. Middleware runs first (via `configureRoutes()`)
2. Guards run next (via `@UseGuards()`)
3. Route handler runs last (if all guards return `true`)

Controller-level guards run before method-level guards. If any guard returns `false`, a 403 Forbidden response is returned.
