# Response Cache

Declarative HTTP response caching on [Cloudflare Workers Caching](https://developers.cloudflare.com/workers/cache/). Mark a route `@Cacheable` and Cloudflare serves it from cache without running your Worker at all — no CPU billed, no database queries, no SSR render. Mark a mutation `@PurgesCache` and it invalidates those entries when it succeeds.

Everything is exported from `stratal/response-cache`.

## Read this first

**1. Every response from a Stratal app now carries an explicit `Cache-Control` header.** Routes without `@Cacheable` are stamped `Cache-Control: private, no-store`. This applies to every app, whether or not it uses this feature, and it is deliberate: Workers Caching applies RFC 9111 heuristic freshness, so a response with *no* `Cache-Control` at all is cached anyway — a `200` for two hours, a `404` for three minutes. An un-annotated authenticated page would otherwise be cached and replayed to other visitors. Caching is opt-in per route; the default is explicitly off.

If a route already sets its own `Cache-Control` (in the handler, or via middleware), that value is left alone.

**2. A response that differs per caller must declare `partitionBy`, which requires the gateway.** Without `gateway: { entrypoint }` configured (see [Per-caller caching](#per-caller-caching-partitionby)), a non-empty `partitionBy` throws `ResponseCacheConfigError` at boot rather than silently sharing one entry between users — and **a guarded route cannot be cached at all**, because its response varies by caller. With the gateway configured, guarded and per-tenant routes *are* cacheable, and `@Cacheable` on a guarded route requires a non-empty `partitionBy` (an explicit `partitionBy: []` there is still rejected).

**"Guarded" means `@UseGuards` specifically.** A route protected by *middleware* instead of a guard is not detected, so `@Cacheable` on it boots cleanly — and if that middleware rejects without setting a cookie, the authorized response is cached under a key that ignores cookies and headers, then replayed to unauthenticated visitors. Protect anything you mark `@Cacheable` with a guard, or do not mark it `@Cacheable`.

## Requirements

Workers Caching must be enabled for the entrypoint:

```jsonc
// wrangler.jsonc
{
  "name": "my-app",
  "main": "src/index.ts",
  "compatibility_date": "2026-07-06",  // or later
  "cache": { "enabled": true }
}
```

Wrangler must be `>= 4.69.0`.

Without the `cache` binding, an app that has `@Cacheable` or `@PurgesCache` routes fails on its **first request** (not at deploy) with `ResponseCacheConfigError`. Caching never silently no-ops.

Per-caller caching (`partitionBy`) needs a second entrypoint and two more settings — see [Per-caller caching](#per-caller-caching-partitionby).

## 1. Import the module

`ResponseCacheModule` is opt-in and is **not** registered automatically. Using `@Cacheable` or `@PurgesCache` without importing it is a boot error.

```typescript
import { Module } from 'stratal/module'
import { ResponseCacheModule } from 'stratal/response-cache'

@Module({
  imports: [
    ResponseCacheModule.forRoot(),
  ],
})
export class AppModule {}
```

## 2. Cache a route

```typescript
import { Controller, Get } from 'stratal/router'
import type { RouterContext } from 'stratal/router'
import { Cacheable } from 'stratal/response-cache'

@Controller('/blog')
export class BlogController {
  @Get('/:slug')
  @Cacheable({ ttl: 300 })
  async show(ctx: RouterContext) {
    return ctx.json(await this.posts.find(ctx.param('slug')))
  }
}
```

Emits `Cache-Control: public, max-age=300`.

`@Cacheable` options:

| Option | Type | Meaning |
|---|---|---|
| `ttl` | `number` | Freshness lifetime in seconds. Required, on the route or via module defaults. Must be positive. |
| `swr` | `number` | `stale-while-revalidate` window in seconds. `0` means no stale window. |
| `tags` | `string[]` | `Cache-Tag` values, for targeted purging. Supports `{scope.path}` interpolation. |
| `vary` | `string[]` | Extra `Vary` header names, unioned with whatever the response already set. |

```typescript
@Get('/pricing')
@Cacheable({ ttl: 3600, swr: 60, vary: ['Accept-Language'] })
async pricing(ctx: RouterContext) { ... }
```

Emits `Cache-Control: public, max-age=3600, stale-while-revalidate=60` and `Vary: Accept-Language`.

Notes:

- **Only `GET` and `HEAD` are ever cached** by Cloudflare — they share one cache entry. `@Cacheable` on any other method emits headers Cloudflare ignores.
- **`@Cacheable` is content-type agnostic.** HTML, JSON, text, images, binary, and streams all cache identically. Nothing privileges JSON.
- Cloudflare never stores `206` or `520`–`526` responses, and caps response size at the zone cache limit.
- The path *and query string* are part of the cache key (order and trailing slash are significant); the request host, cookies, `User-Agent`, and `Authorization` are not.
- The Worker version is part of the cache key, so **a deploy invalidates the cache automatically**.

## 3. Tag entries for targeted purging

```typescript
@Get('/blog/:slug')
@Cacheable({ ttl: 300, tags: ['post:{param.slug}'] })
async show(ctx: RouterContext) { ... }
```

A request for `/blog/hello-world` emits `Cache-Tag: post:hello-world`.

Interpolation scopes:

| Scope | Source |
|---|---|
| `{param.x}` | Route parameters |
| `{query.x}` | Query string values |
| `{data.x}` | The payload the handler returned — a JSON-family response body, or Inertia's resolved page props |

`{body.*}` is **rejected at boot**. The parsed request body is not available when tags are rendered, so such a tag could never resolve. Use `{param.*}`, `{query.*}`, or `{data.*}`.

Nested paths work (`{data.post.categoryId}`). A `.*` suffix on an array value expands into one tag per element:

```typescript
@Cacheable({ ttl: 300, tags: ['post:{data.ids.*}'] })
// payload { ids: [1, 2, 3] }  ->  Cache-Tag: post:1,post:2,post:3
```

Only one `.*` fan-out per tag.

`{data.*}` reads the response body only for the JSON family (`application/json` and any `+json` suffix); Inertia publishes its page props directly, so Inertia HTML documents support it too. Other content types cache normally but can only tag from `{param.*}` and `{query.*}`.

Tag values are validated strictly, because Cloudflare drops malformed tags silently. A tag must be non-empty printable ASCII (`0x21`–`0x7E`) at most 1024 bytes, and may not contain a **comma** or a **double quote**. The comma is the `Cache-Tag` list delimiter: `?slug=a,b` interpolated into `post:{query.slug}` would emit two tags, neither of them the one declared, and on a `@PurgesCache` route would purge tags the author never named. On a `@Cacheable` route, a tag that fails to render (missing value, bad characters) does **not** fail the request — the response falls back to `private, no-store` and the reason is logged at `error`. The response is simply not cached.

## 4. Purge on mutation

```typescript
import { Controller, Post } from 'stratal/router'
import { PurgesCache } from 'stratal/response-cache'

@Controller('/posts')
export class PostsController {
  @Post('/:slug/publish')
  @PurgesCache({ tags: ['post:{param.slug}'] })
  async publish(ctx: RouterContext) {
    return ctx.json(await this.posts.publish(ctx.param('slug')))
  }
}
```

`@PurgesCache` options:

| Option | Type | Meaning |
|---|---|---|
| `tags` | `string[]` | Purge every entry carrying these `Cache-Tag` values. Same interpolation as `@Cacheable`. |
| `pathPrefixes` | `string[]` | Purge every entry whose request path starts with one of these. |
| `purgeEverything` | `boolean` | Purge the whole entrypoint's cache. **Exclusive** — cannot be combined with `tags` or `pathPrefixes`. |

The purge fires after the handler returns a `2xx` or `3xx`. A failing handler purges nothing.

`@PurgesCache` works on its own — the route does not have to be `@Cacheable`. That is the normal case: a `POST`/`PUT`/`DELETE` invalidating cached `GET` entries.

`pathPrefixes` matches the request path only, so `pathPrefixes: ['/blog']` also clears `/blog?page=2` — pagination invalidation needs no extra tags.

```typescript
@Post('/posts')
@PurgesCache({ pathPrefixes: ['/blog'] })
async create(ctx: RouterContext) { ... }
```

Tag interpolation can read the handler's own result, which is what makes it possible to purge by a value the request never carried:

```typescript
@Post('/posts/:slug/publish')
@PurgesCache({ tags: ['post:{param.slug}', 'category:{data.categoryId}'] })
async publish(ctx: RouterContext) {
  return ctx.json(await this.posts.publish(ctx.param('slug')))  // { categoryId: 'c1', ... }
}
```

### Purge failures throw

The purge is awaited before the response is sent — deferring it would let a client that immediately re-reads receive pre-write content. If the purge fails, `CachePurgeError` is thrown and the client sees a `500` **for a mutation that already committed**. This is deliberate: a cache silently disagreeing with the database is worse than a loud failure. Clients of a `@PurgesCache` route must treat a `500` as "possibly applied" and re-read rather than blindly retrying.

The same applies when the `cache` binding is missing: every successful mutation on a `@PurgesCache` route turns into a `500`. Confirm `"cache": { "enabled": true }` is present in *every* environment.

## 5. Module defaults

`forRoot({ defaults })` supplies any `@Cacheable` field except `tags`, which is always route-specific.

```typescript
ResponseCacheModule.forRoot({
  defaults: { ttl: 300, swr: 60, vary: ['X-Inertia'] },
})
```

```typescript
@Get('/pricing')
@Cacheable()                    // ttl 300, swr 60, Vary: X-Inertia

@Get('/blog/:slug')
@Cacheable({ ttl: 60, vary: ['Accept-Language'] })
// ttl 60, swr 60, Vary: X-Inertia, Accept-Language
```

Merge rules:

| Field | Resolution |
|---|---|
| `ttl`, `swr` | Route value wins; otherwise the default |
| `partitionBy` | Route value **replaces** the default outright — never merged |
| `vary` | Union of module and route values |
| `tags` | Route only; no module default |

**Defaults never make a route cacheable.** `@Cacheable` stays mandatory — a `defaults` block changes what an opted-in route does, never which routes opt in. Reading a controller is always enough to know what is cached.

`forRootAsync({ useFactory, inject })` is available, but its factory **must resolve synchronously** — route registration reads `defaults` at boot, before an async factory could settle. An async factory throws `ResponseCacheConfigError` at boot rather than silently caching without the intended defaults.

## Per-caller caching (`partitionBy`)

Cache a route whose response differs per user, per tenant, or per role. The partition value goes into `ctx.props`, which Cloudflare includes in the cache key and documents as impossible to bypass — two callers with different props can never receive each other's response.

This needs a **second entrypoint**. The default export becomes a gateway with caching *disabled*; a named export runs the same app with caching *enabled*. The gateway resolves the partitions and forwards the request to it.

### 1. Export the cached entrypoint

```typescript
// src/index.ts
import { Stratal } from 'stratal'
import { cachedEntrypoint } from 'stratal/workers'
import { AppModule } from './app.module'

const stratal = new Stratal({ module: AppModule })

export default stratal                            // gateway  (cache off)
export const Cached = cachedEntrypoint(stratal)   // cached    (cache on)
```

### 2. Configure Wrangler

```jsonc
// wrangler.jsonc
{
  "compatibility_date": "2026-07-06",
  "compatibility_flags": ["enable_ctx_exports"],
  "cache": { "enabled": true },
  "exports": {
    "default": { "type": "worker", "cache": { "enabled": false } },
    "Cached":  { "type": "worker", "cache": { "enabled": true } },
  },
}
```

All three of `enable_ctx_exports`, `cache.enabled: false` on `default`, and `cache.enabled: true` on the named export are required. Without them the app fails on its first request with `ResponseCacheConfigError`.

### 3. Register the gateway and its resolvers

```typescript
import { ResponseCacheModule } from 'stratal/response-cache'
import { AUTH_GATEWAY_PRIMERS } from '@stratal/framework/auth'

ResponseCacheModule.forRoot({
  gateway: { entrypoint: 'Cached' },   // must match the export name exactly
  primers: AUTH_GATEWAY_PRIMERS,       // needed for ctx.user() in a resolver
  partitions: {
    user:   (ctx) => ctx.user().id,
    tenant: (ctx) => ctx.param('tenant') ?? null,
    role:   (ctx) => ctx.user().role ?? 'guest',
  },
})
```

`primers` run in the gateway before the resolvers, populating the request container. **A resolver that calls `ctx.user()` or reads the request container needs `AUTH_GATEWAY_PRIMERS`** — without it `ctx.user()` throws on every request, the route is never cached, and a one-time warning names the partition.

> Run `wrangler types` and `gateway.entrypoint` accepts only your Worker's real, non-`default` export names — your editor autocompletes them and a typo is a compile error.

### 4. Declare partitions on routes

```typescript
@Get('/dashboard')
@Cacheable({ ttl: 60, partitionBy: ['user'] })      // one entry per user

@Get('/t/:tenant/reports')
@Cacheable({ ttl: 300, partitionBy: ['tenant'] })   // one entry per tenant

@Get('/feed')
@Cacheable({ ttl: 300, partitionBy: ['role'] })     // far better hit rate

@Get('/pricing')
@Cacheable({ ttl: 3600 })                           // shared public entry
```

### Rules

- **A resolver returning `null`/`undefined`, or throwing, fails closed.** The request runs normally and the response is stamped `private, no-store`. An anonymous bucket must be an explicit sentinel (`?? 'guest'`), never an implicit null — otherwise "no session" and "auth failed" collapse into one shared entry.
- **Only `GET`/`HEAD` are forwarded.** Mutations always run in the gateway.
- **`partitionBy` replaces a module default rather than merging**, so reading the route alone tells you how it is keyed.
- **`partitionBy: []` on a guarded route is rejected**, not honoured — declaring a guarded route public is the exact mistake the rule exists to catch.
- **A partition name with no registered resolver is a boot error.**
- **`gateway.entrypoint` cannot be `"default"`** — the gateway would forward to itself and recurse until the subrequest limit.
- On a cache **miss** the auth primer's session lookup runs twice (once in the gateway, once in the app). On a **hit** the app never runs at all.

## What is never cached

A `@Cacheable` response is downgraded to `Cache-Control: private, no-store` (and the reason logged) when:

- the response carries `Set-Cookie` (a session or Inertia flash cookie)
- the status is not `2xx`
- a `Cache-Tag` template failed to render
- **Inertia only:** the page has flash data, the request is a partial reload (`X-Inertia-Partial-Data`), or the resolved props contain a `once()` prop — replaying a send-once prop from cache to every client breaks its contract

Cloudflare additionally bypasses the cache when the request carried an `Authorization` header.

A partitioned route is also downgraded to `private, no-store` whenever its partitions are not actually in the cache key — a resolver that returned `null`/`undefined` or threw, a primer that short-circuited, or a caller that reached the cached entrypoint without the matching `ctx.props`. Failing closed is always preferred over caching under a key that does not describe the caller.

Cache decisions are also refused at boot for: `@Cacheable` on a guarded route with an empty effective `partitionBy`, a non-empty `partitionBy`/`partitions`/`primers` with no `gateway.entrypoint` configured, a `gateway.entrypoint` of `"default"` (the gateway cannot forward to itself — it would recurse until the subrequest limit) or an empty string, a `partitionBy` naming a partition with no registered resolver, a `{body.*}` tag, a `{param.x}` tag whose `x` isn't a `:param` in that route's own path (it can never resolve, same reasoning as `{body.*}`), a `{…}` placeholder in `pathPrefixes` (only `tags` are interpolated), a missing or non-positive `ttl`, a negative `swr`, `purgeEverything` combined with `tags`/`pathPrefixes`, and `@Cacheable`/`@PurgesCache` on a wildcard controller — one implementing `handle()`. (`@All` is an ordinary decorated method and *is* accepted.)

## Inertia SSR

Inertia needs no extra wiring. `@Cacheable` on an Inertia route is sufficient, and on a cache hit the Worker never executes — the React SSR render is skipped entirely and no CPU is billed. A traffic burst on a cold page runs the render once, not once per request (Cloudflare collapses concurrent requests for the same key).

```typescript
import { InertiaGet } from '@stratal/inertia'
import { Cacheable } from 'stratal/response-cache'

@InertiaGet('/blog/:slug')
@Cacheable({ ttl: 300, tags: ['post:{param.slug}'] })
async show(ctx: RouterContext) {
  return ctx.inertia('Blog/Show', { post: await this.posts.find(ctx.param('slug')) })
}
```

Two properties come for free:

- **`Vary: X-Inertia` is already set** by `InertiaMiddleware`, so the HTML document and the JSON page response cache as separate variants of the same URL.
- **A deploy invalidates the cache automatically**, because the Worker version is part of the cache key. The asset-version `409` storm that would otherwise follow a deploy cannot happen.

Pages are automatically not cached when they carry flash data, are a partial reload, or contain a `once()` prop. Since guarded routes cannot be cached at all, only public pages are eligible — a marketing site, blog, docs, or public catalogue.

**If access control is configured, every Inertia page carries a per-user `access` prop.** A `@Cacheable` Inertia route with no `partitionBy` caches the first requester's roles and permissions and serves them to every later visitor — set `partitionBy` on any cached Inertia route (see [Per-caller caching](#per-caller-caching-partitionby)).

## Local development

**Miniflare does not implement `ctx.cache`.** `wrangler dev` (local mode) and raw `vitest-pool-workers` (without `@stratal/testing`) never populate `ExecutionContext.cache` — a `@Cacheable`/`@PurgesCache` route 500s on its first request (`ResponseCacheConfigError`) exactly as it would against a genuinely misconfigured deploy. Use `wrangler dev --remote` or a deployed environment to observe actual caching.

**`@stratal/testing` is the exception** — see [Testing](#testing) below. It supplies a `ctx.cache` stub by default, so `@Cacheable`/`@PurgesCache` routes are testable through `Test.createTestingModule()` with no extra configuration.

What is locally testable (against `@stratal/testing`'s stub, or a hand-mocked `WorkersCache`):

- header emission — assert `Cache-Control`, `Cache-Tag`, and `Vary` on the response
- every boot-time configuration error
- the fail-closed matrix (the `private, no-store` downgrades)
- `@PurgesCache` succeeding and which `PurgeSpec` it issued

What is not:

- cache hits, misses, `stale-while-revalidate`, and request collapsing — the stub only records purge specs and always reports success; it does not model an actual cache store

Verify caching behaviour against a deployed environment: request the same URL twice and compare response latency, or watch Worker invocations in the Cloudflare dashboard — a hit does not invoke the Worker at all.

## Testing

`@stratal/testing` installs a `ctx.cache` stub (`TestWorkersCache`) by default on every module compiled with `Test.createTestingModule()`. This exists because neither Miniflare nor workerd ever populates `ExecutionContext.cache` locally — without the stub, adding a single `@Cacheable`/`@PurgesCache` route to an app would 500 that app's entire test suite (`ResponseCacheConfigError`, see [Requirements](#requirements)).

With the stub (the default — nothing to configure):

```typescript
const module = await Test.createTestingModule({ imports: [BlogModule] }).compile()

const response = await module.http.get('/blog/hello-world').send()
response.assertOk()
response.assertHeader('Cache-Control', 'public, max-age=300')
response.assertHeader('Cache-Tag', 'post:hello-world')
```

`@PurgesCache` routes succeed, and every purge spec is recorded, in call order, on `module.cache.purges`:

```typescript
await module.http.post('/posts/hello-world/publish').send()

expect(module.cache.purges).toEqual([{ tags: ['post:hello-world'] }])
```

The stub always reports success — it proves your app's cache *configuration* is correct (the right tags, the right routes), not Workers Caching's own failure modes. `CachePurgeError` handling itself is `stratal`'s responsibility and is covered by its own test suite; there's no supported way to make the stub's `purge()` fail.

### Testing partitioned routes

A `ctx.exports` stub is installed alongside the cache stub, for the same reason: workerd never populates it, so a gateway app would fail its boot verification on the first request of every suite. Forwarded requests are recorded on `module.gateway.loopbacks`, and the stub really does re-run the request through the cached path with the resolved props:

```typescript
await module.http.get('/dashboard').withHeaders({ Cookie: session }).send()

expect(module.gateway.loopbacks).toEqual([
  { entrypoint: 'Cached', method: 'GET', url: 'http://localhost/dashboard', props: { user: 'u-1' } },
])
```

An **empty** `loopbacks` is the assertion for every fail-closed case — an unresolved partition, a non-`GET`, or a route with no `partitionBy` all run inline and never appear.

> The stub answers to **any** export name, so run `wrangler types` and let the type checker verify `gateway.entrypoint` against your real exports.

Purges forwarded over RPC land on the same `module.cache.purges`, so purge assertions read identically with or without a gateway.

Opt out with `cache: false` to reproduce a runtime where Workers Caching is genuinely unconfigured — e.g. to assert the boot guard itself:

```typescript
const module = await Test.createTestingModule({
  imports: [BlogModule],
  cache: false,
}).compile()

const response = await module.http.get('/blog/hello-world').send()
response.assertServerError() // ResponseCacheConfigError
```

## Errors

| Error | When | Fix |
|---|---|---|
| `ResponseCacheConfigError` | Boot, or first request | See the boot-error list above; the message names the controller and method |
| `CachePurgeError` | A `@PurgesCache` route whose purge failed | The mutation committed; check the `cache` binding exists in this environment |
| `InvalidCacheTagError` | A tag template that cannot render | On a `@Cacheable` route it is caught and the response fails closed (logged, not cached). On a `@PurgesCache` route (e.g. a `{query.*}`/`{data.*}` tag whose value is missing from this particular request) it is logged at `error` — naming the controller/action and route path — then rethrown as `CachePurgeError` and fails the request; a purge aimed at the wrong entries must not pass silently |

All three are exported from `stratal/response-cache` and extend `ApplicationError`, so they can be matched in a custom `ExceptionHandler`.

## Choosing a TTL

- Cloudflare's cache is read-through and tiered; a short `ttl` with a generous `swr` gives fresh-ish content with hit-rate close to a long `ttl`.
- Prefer `tags` + `@PurgesCache` over a short `ttl` when content changes on a known event. Purge is immediate; TTL expiry is not.
- `ttl` is a *maximum*, not a guarantee — entries can be evicted earlier.
