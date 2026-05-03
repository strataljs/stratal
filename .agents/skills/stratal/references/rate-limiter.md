# Rate Limiter

Named rate limiters with pluggable storage. Define limiters once at boot, attach to routes via `router.throttle('name')` or `@RateLimit('name')`. Returns `429` with `Retry-After` and `X-RateLimit-*` headers (content-negotiated body — JSON, HTML, Inertia).

`RateLimiterModule` is opt-in. Import it in your AppModule with `forRoot({ store })` — there is no implicit default.

## 1. Configure the store

```typescript
import { Module } from 'stratal/module'
import { RateLimiterModule } from 'stratal/rate-limiter'

@Module({
  imports: [
    RateLimiterModule.forRoot({ store: 'kv', binding: 'RATE_LIMITS' }),
  ],
})
export class AppModule {}
```

For `store: 'kv'`, declare the KVNamespace in `wrangler.jsonc`:

```jsonc
{
  "kv_namespaces": [
    { "binding": "RATE_LIMITS", "id": "..." }
  ]
}
```

Other store options:

```typescript
RateLimiterModule.forRoot({ store: 'memory' })                                     // tests / single-isolate only
RateLimiterModule.forRoot({ store: { useClass: DurableObjectRateLimiterStore } }) // custom
```

Async configuration:

```typescript
RateLimiterModule.forRootAsync({
  inject: [CONFIG_TOKENS.ConfigService],
  useFactory: (config: IConfigService) => ({
    store: 'kv' as const,
    binding: config.get('rateLimit').binding as keyof StratalEnv,
  }),
})
```

## 2. Define named limiters

Resolve `RateLimiterRegistry` from the container in any module's `OnInitialize` hook. **Constructor `@inject` does not work on module classes** — use the `OnInitialize({ container })` hook.

```typescript
import { Module } from 'stratal/module'
import type { ModuleContext, OnInitialize } from 'stratal/module'
import { Limit, RATE_LIMITER_TOKENS, type RateLimiterRegistry } from 'stratal/rate-limiter'

@Module({})
export class RateLimitsModule implements OnInitialize {
  onInitialize({ container }: ModuleContext): void {
    const limiter = container.resolve<RateLimiterRegistry>(RATE_LIMITER_TOKENS.Registry)

    limiter.for('api', (ctx) =>
      Limit.perMinute(60).by(ctx.header('cf-connecting-ip') ?? 'global'),
    )

    limiter.for('uploads', (ctx) => {
      const auth = ctx.getContainer().resolve<AuthContext>(DI_TOKENS.AuthContext)
      return Limit.perHour(100).by(auth.userId)
    })

    // Multiple windows on one name
    limiter.for('ai', (ctx) => [
      Limit.perMinute(10).by(ctx.userId),
      Limit.perDay(1000).by(ctx.userId),
    ])

    // Conditional bypass
    limiter.for('internal', (ctx) =>
      ctx.header('x-internal-token') ? Limit.none() : Limit.perMinute(30).by(ctx.ip),
    )

    // Custom 429 body
    limiter.for('login', (ctx) =>
      Limit.perMinute(5)
        .by(ctx.header('cf-connecting-ip') ?? 'global')
        .response((ctx, headers) =>
          ctx.json({ error: 'Slow down' }, 429, headers),
        ),
    )
  }
}
```

Add `RateLimitsModule` to your AppModule's `imports`. Calling `for(name, ...)` twice with the same name overwrites — last definition wins.

### `Limit` factories

```typescript
import { Limit } from 'stratal/rate-limiter'

Limit.perSecond(10)
Limit.perSeconds(10, 3)           // 3 requests per 10 seconds
Limit.perMinute(60)
Limit.perMinutes(15, 200)         // 200 requests per 15 minutes
Limit.perHour(1000)
Limit.perDay(10_000)
Limit.none()                      // bypass for this request
```

### Chainable methods

| Method | Effect |
|--------|--------|
| `.by(key)` | Scope counter to this actor (user id, IP, tenant). Defaults to a single global counter. |
| `.response(handler)` | Override the default 429 response. Receives `(ctx, headers)` — spread `headers` to keep the standard `Retry-After` / `X-RateLimit-*`. |

## 3. Attach to routes

Two attachment paths — pick whichever fits the call site. Both can stack on the same route.

### Router scope

```typescript
import type { RouteConfigurable } from 'stratal/router'
import { Router } from 'stratal/router'

@Module({ controllers: [UploadsController] })
export class UploadsModule implements RouteConfigurable {
  configureRoutes(router: Router): void {
    router
      .prefix('/uploads')
      .middleware(AuthMiddleware)
      .throttle('uploads')
  }
}

// or inside group()
router.group([AdminController], (admin) => {
  admin.throttle('admin').middleware(AdminGuard)
})
```

### Decorator

Class-level applies to every method. Method-level stacks on top. Multiple `@RateLimit` decorators on the same target stack (each adds another named limiter).

```typescript
import { Controller, Get, Post } from 'stratal/router'
import { RateLimit } from 'stratal/rate-limiter'

@Controller('/api/v1/users')
@RateLimit('api')                    // every method
export class UsersController {
  @Get('/')
  list(ctx: RouterContext) { ... }

  @Post('/')
  @RateLimit('writes')               // stacks with class-level 'api'
  create(ctx: RouterContext) { ... }

  @Post('/bulk')
  @RateLimit('writes')
  @RateLimit('bulk-writes')          // multiple decorators stack
  bulk(ctx: RouterContext) { ... }
}
```

Duplicate names on a single route collapse to one middleware automatically.

## Response headers

On every successful response from a throttled route:

```
X-RateLimit-Limit:     60
X-RateLimit-Remaining: 59
X-RateLimit-Reset:     1735689600    (epoch seconds)
```

On a 429:

```
Retry-After:           42            (seconds)
X-RateLimit-Limit:     60
X-RateLimit-Remaining: 0
X-RateLimit-Reset:     1735689642
```

When multiple limits apply, headers reflect the most restrictive on success and the limit that triggered the 429 on failure.

## Custom store

`IRateLimiterStore` is a typed key-value store with TTL — the registry handles increment math itself, so a custom store only needs to persist arbitrary values.

```typescript
import { Transient } from 'stratal/di'
import type { IRateLimiterStore } from 'stratal/rate-limiter'

@Transient()
export class RedisRateLimiterStore implements IRateLimiterStore {
  async get<T>(key: string): Promise<T | null> { ... }
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> { ... }
  async delete(key: string): Promise<void> { ... }
}

// Wire it up:
RateLimiterModule.forRoot({ store: { useClass: RedisRateLimiterStore } })
```

The class is resolved from the DI container, so it can `@inject` other services.

> **KV caveat**: The built-in KV store does get-modify-set without atomic increment — concurrent edge requests against the same key may undercount. Use a Durable Object store for strict accuracy. KV's minimum `expirationTtl` is 60s; sub-60s windows still enforce correctly via the persisted `resetAt`.

## Better-auth interop

`@stratal/framework/auth` augments `RateLimiterRegistry` with `forPath()` and auto-wires better-auth's `rateLimit` block when both modules are imported. See `references/auth-and-rbac.md` "Rate-limit interop".

## Errors

| Class | When |
|-------|------|
| `TooManyRequestsError` | Limit exceeded. HTTP 429, code `4290`. Already in `dontReport` list. |
| `RateLimiterNotConfiguredError` | Imported `RateLimiterModule` without calling `forRoot()`. Thrown at `app.initialize()`. |
| `RateLimiterModuleNotImportedError` | Used `router.throttle()` / `@RateLimit` but `RateLimiterModule` is not in any imported module. Thrown at first throttled request. |
| `RateLimiterNotDefinedError` | Limiter name was never registered via `RateLimiterRegistry.for(...)`. Likely a typo or missing limiter-definitions module. |

All except `TooManyRequestsError` map to HTTP 500 — they signal misconfiguration.

## DI token

```typescript
import { RATE_LIMITER_TOKENS } from 'stratal/rate-limiter'

RATE_LIMITER_TOKENS.Registry      // RateLimiterRegistry — resolve to call .for(name, resolver)
```
