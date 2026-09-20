---
"stratal": minor
---

Move routing onto plain Hono with lazy OpenAPI generation, add declarative response caching on Cloudflare Workers Caching, and add per-path locale detection.

### Routing and validation

- Build the router on plain Hono with per-route validation and lazy OpenAPI generation. Validation is attached only to routes that declare `params`, `query` or `body`, so a schema-less route pulls in none of it: a hello-world worker drops from 944 KB to 504 KB raw. `ctx.param()`, `ctx.query()` and `ctx.body()` are unchanged.
- Validate request and response schemas asynchronously, so a schema may carry a refinement that reaches a database, a cache or a service binding to decide whether a value is acceptable. Such a refinement runs inside the request's DI scope, so it needs no context threaded into the schema, and a failure now surfaces as a 400 carrying the refinement's message rather than a 500 with no field detail. Fully synchronous schemas are unaffected.
- Accept full schema metadata in `describe()` and `named()`, not just a description string — `example`, `examples`, `title` and `deprecated` all flow through to the generated OpenAPI document.
- Add route visibility `groups`. `@Controller` and route options take a `groups: string[]` label list, exposed on each route's schema metadata, so the OpenAPI `routeFilter` can scope a document by group instead of by path string.

### Response caching

Add declarative HTTP response caching through the new `stratal/response-cache` entry. On a cache hit the Worker never runs, so no CPU is billed.

- `@Cacheable({ ttl, browserTtl, swr, tags, vary })` on `GET` and `HEAD` routes emits `CDN-Cache-Control` and `Cache-Control` alongside `Cache-Tag`. `browserTtl` defaults to `ttl`, which is what makes a repeat visit free rather than a round trip; set `browserTtl: 0` where retraction has to be reliable, since tags and `ctx.cache.purge()` reach the shared cache and nothing else.
- `@PurgesCache({ tags, pathPrefixes, purgeEverything })` purges after a `2xx` or `3xx`. The purge is awaited and a failure is rethrown as `CachePurgeError`, rather than leaving the cache silently inconsistent with the database.
- `ResponseCacheModule.forRoot({ defaults })` supplies `ttl`, `swr` and `vary` for every `@Cacheable` route. Defaults never make a route cacheable on their own — `@Cacheable` stays mandatory.
- Interpolate `{param.*}`, `{query.*}`, `{data.*}` and `{partition.*}` into cache tags, with a `.*` suffix fanning an array out to one tag per element. A rendered tag must be printable ASCII with no space, comma or double quote and at most 1024 bytes, or it throws `InvalidCacheTagError` — slugify any request-derived value before interpolating it.
- Cache guarded and per-tenant routes with `@Cacheable({ partitionBy: [...] })`. Export `cachedEntrypoint(stratal)` from `stratal/workers` alongside your default export, then configure `gateway: { entrypoint: 'Cached' }` with `partitions` and `primers`. Partitioned reads are forwarded to that entrypoint, which places the resolved partitions in the part of the cache key that cannot be bypassed. `gateway.entrypoint` is type-checked against your Worker's real exports once you have run `wrangler types`. A guarded route is only ever cacheable with a non-empty `partitionBy`, and a partition that fails to resolve runs inline and is stamped `private, no-store` rather than being cached publicly.
- Put a response's representation in the cache key with `gateway: { keyBy: [...] }`, so one URL answered two ways is two entries rather than one entry with two variants. **An Inertia app behind a gateway should set `keyBy: INERTIA_VARY_HEADERS`, exported from `@stratal/inertia`; without it those pages stop caching.**
- Strip `X-RateLimit-*` from a response a shared cache may store. They describe one caller's budget, so on a shared response they are replayed to every other caller, and a cache hit never runs the throttle to count them down. The limit is still consumed and enforced; only the reporting is withheld. Adds `isSharedCacheable` and `PER_CALLER_RATE_LIMIT_HEADERS`.
- Requires `"cache": { "enabled": true }` in `wrangler.jsonc`, Wrangler 4.69.0 or newer, and a `compatibility_date` of `2026-07-06` or later. Without those a `@Cacheable` route is served uncached and stamped `private, no-store`, and the reason is logged once per entrypoint.
- New errors: `ResponseCacheConfigError`, `CachePurgeError`, `InvalidCacheTagError`.

### Storage

- Add `head()`, `list()` and `deleteMany()` to `StorageService`. `head(path, disk?)` reads an object's size, content type, etag, upload time and custom metadata without transferring its body, or `null` when nothing is stored there. `list(options?, disk?)` pages objects under a disk-relative `prefix` and carries `truncated` and `cursor`, so loop while `truncated` is true to cover a whole prefix. `deleteMany(paths, disk?)` deletes in bulk instead of one call per file.
- Stop serving arbitrary stored content types inline from downloads. An object stored as `text/html`, or as a scriptable `image/svg+xml`, previously executed against whatever session fetched it, since objects are served from the application's own origin. Only `application/pdf`, `image/png`, `image/jpeg`, `image/gif` and `image/webp` now render inline; everything else returns as an attachment. Every download also carries `X-Content-Type-Options: nosniff` and a sandboxing `Content-Security-Policy`.
- Fix downloads of keys containing a space, a non-ASCII character, `#` or `?` — most user-supplied filenames — being reported as missing, and stop a key containing a control character producing a malformed header. Non-ASCII filenames are preserved.

### Internationalisation

- Add per-path locale detection: `detection` accepts a `(path) => options` resolver, alongside `I18nModule.forRootAsync` and a strategy-aware `ctx.setLocale`. Different areas can now use different strategies — a path-localized public site with a cookie-localized `/admin` panel, say — which is necessary when an area's session cookie is path-scoped. Only routes whose path resolves to `strategy: 'path'` get a `/:locale` variant; everything else is served at its bare path with no change to URL builders. The resolver must be a pure function of the path, since it is consulted both at boot and per request.
- The cookie strategy scopes the `locale` cookie by the resolved `cookieOptions`, so a per-path cookie area writes `{ path: '/admin' }`. Plain `strategy: 'cookie'` behaviour is unchanged.
- Fix localized multi-segment URLs matching the wrong route when two or more locales are path-prefixed, which could produce a redirect loop on a homepage that redirects elsewhere.

### Quarry CLI

- Run the Quarry host on Miniflare 5. **Quarry now requires Wrangler 4.124 or newer.** Local state still lands in `.wrangler/state/v3/<plugin>`, so existing KV, D1, R2, Durable Object and cache state carries over and is still shared with a running `wrangler dev`.
- Stream command output to the terminal as it is produced rather than only after the command finishes, so long-running commands show progress live.
- Source `process.env` into worker vars and secrets, so CI and scripted runs that pass config through the environment no longer fail validation on a missing binding. Local runs with a `.dev.vars` are unchanged.
- Stop failing with `The Workers runtime failed to start` on a worker that declares a Cloudflare Workflow. Workflow bindings are stripped from the host and logged — trigger workflows from the worker that defines them.
- Fix `mcp:serve` and `mcp:tools` failing to start: both built the OpenAPI document from the root container, but commands run in a request scope and the document needs the request-scoped OpenAPI config service.
- Match the Workers socket contract in the Node polyfill, so closing a socket resolves once it is closed and a TLS upgrade returns the upgraded socket. Sending mail through the CLI was the common path affected.

### Other fixes

- `Limit.distinctBy(value)` counts distinct values in the window instead of requests, for caps like "ten different courses a day".
- Honour a `Response` returned by a short-circuiting middleware even when an outer middleware forwards control with `await next()` and discards the result. An early `ctx.redirect(...)` was previously dropped, leaving the request unfinalized and throwing "Context is not finalized". `Next` is widened to `() => Promise<Response | void>` so a forwarding middleware can `return next()` without a cast.
- Let errors contribute structured fields to their own log entry through an overridable `reportContext()` hook on `ApplicationError`. A failed validation now logs which field failed and why, where it previously logged only a generic line.
- Stop `/openapi.json` failing when a route schema contains a type with no JSON Schema representation, such as `z.custom`, `z.date` or `z.set`. Those emit an empty schema instead of throwing, so one unrepresentable field no longer takes down the whole document.
- Fix route registration failing when the router module is evaluated more than once, for example under a bundler or an SSR module runner.
- Declare `openapi3-ts` as a direct dependency, which a clean install such as CI could not otherwise resolve.

### Breaking Changes

- **The validation API is `zod/mini`.** The `z` re-export from `stratal/validation` is removed. Import schema builders directly from `zod/mini` using named imports and replace classic chaining with the functional API: `z.string().min(1).optional()` becomes `optional(string().check(minLength(1)))`. `stratal/validation` still exports `cuid2` and `withZodI18n`, plus `describe()` and `named()` for descriptions and OpenAPI component ids, since `zod/mini` has no `.describe()` or `.meta()`.
- **OpenAPI documents are generated lazily**, on the first request to the docs endpoint. `OpenAPIService.getSpec()` becomes `getSpec(container)` and is async — update any direct call. `routeFilter` is now a metadata predicate `(route: RouteSchemaMeta) => boolean` instead of `(path, pathItem)`; filter on `route.groups` or `route.meta` rather than on the path string.
- **Every response now carries an explicit `Cache-Control` header.** Routes without `@Cacheable` are stamped `private, no-store`. This affects every app, not only those adopting caching: Cloudflare applies heuristic freshness to a response carrying no `Cache-Control` at all, caching a `200` for two hours, so the explicit header is what keeps an uncacheable route uncached. Routes that set their own `Cache-Control` are left alone — if you relied on a response having none, set one explicitly.
- **`CacheService.put` is now fire-and-forget and can no longer report failure.** It schedules the write, resolves immediately and logs a rejection instead of throwing, so `try { await cache.put(...) } catch { … }` now sees success even when the value was never stored. A cache is best-effort, and a KV write can add hundreds of milliseconds to a request, so this is the right default — but move any write that must not be silently lost to `CacheService.putDurable` / `TieredCacheService.putDurable`, which await the write and throw on failure. `delete` is unchanged and remains durable and awaited.
- **Storage downloads no longer render arbitrary content types inline.** Only `application/pdf`, `image/png`, `image/jpeg`, `image/gif` and `image/webp` render inline; everything else downloads as an attachment. If you relied on another type rendering in the browser, serve that content from a separate origin, where a compromise cannot reach the application's session.
- **Guards now deny when `canActivate` returns `false`**, with `GuardRejectedError` (403), instead of the return value being ignored. Audit your `canActivate` implementations before upgrading — requests that previously reached the handler now 403. `GuardRejectedError` is also re-exported from `@stratal/framework/guards`.
- **Quarry requires Miniflare 5**, which comes in with Wrangler 4.124 or newer. Apps on an older Wrangler must upgrade before `npx quarry` will start.
