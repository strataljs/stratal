---
"@stratal/framework": minor
---

Add cursor pagination, share permissions with the client for Inertia access control, and add a Workers-safe database pool factory.

### Cursor pagination

Add `db.$cursor` for reading a list one page at a time, positioned by an opaque cursor rather than an offset.

```typescript
const page = await db.$cursor.thread.findMany({
  cursor: ctx.query('cursor'),
  take: 20,
  orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
  where: { userId },
})
// → { data, perPage, cursorName, cursor, nextCursor, prevCursor }
```

- Rows added, removed or updated around the reader do not shift the page, so walking a list neither skips a row nor repeats one.
- `orderBy` is required and must end in a unique column, so tied rows do not share a position. `where`, `select`, `include` and `omit` work as on the model's own `findMany`, and `select` narrows the result type.
- Pass the result to `@stratal/inertia`'s `ctx.scroll()` as it is, or return it from a JSON route. Cursors are opaque — pass back the one a result gave you.
- A transaction client carries the same reader, and `db.$cursor.$from({ findMany }, …)` pages a `UNION` or a raw statement.
- Distinct from ZenStack's own `cursor` argument, which is offset-based and correct only while the list is unchanged.

### Access control and auth

- Share the current user's permissions and roles automatically once `accessControl` is configured, so the client can gate on them. This backs the `<Can>`, `<Cannot>`, `<HasRole>` and `<HasNoRole>` components and the `useCan`, `useRole` and `useAccess` hooks in `@stratal/inertia`, with permission strings and role names type-checked against a generated registry.
- Add `AUTH_GATEWAY_PRIMERS`, exported from `@stratal/framework/auth`, so guarded and per-tenant routes can use `@Cacheable({ partitionBy: [...] })`. The response-cache gateway resolves partitions outside the app's middleware chain, so a resolver calling `ctx.user()` would otherwise throw on every request:

  ```typescript
  ResponseCacheModule.forRoot({
    gateway: { entrypoint: 'Cached' },
    primers: AUTH_GATEWAY_PRIMERS,
    partitions: { user: (ctx) => ctx.user().id },
  })
  ```

- Carry the cookies a session read issues through to the response. The `Set-Cookie` Better Auth writes while reading a session was previously discarded, so under `session.cookieCache` the cached-session cookie was minted on every request and reached the browser on none, and a session passing `session.updateAge` never delivered its extended expiry — a browser's copy expired on the schedule it was first given rather than sliding. Cookie names the handler has already written are left alone, so sign-out still clears them.
- Fix role reads and writes failing for any app whose ZenStack user model is not named exactly `User`. Setting a user's role, reading another user's roles, checking a permission and listing a user's permissions all threw when the model resolved to a different accessor, such as a pluralized `Users`. Changing a role now also refreshes that user's sessions, so it takes effect immediately.
- Adapt the Better Auth rate-limit bridge to the new atomic `consume` storage. `createBetterAuthRateLimitStorage()` now returns `{ consume }`, and records expire after the rule's own window instead of a fixed day, so stale counters no longer linger in KV. Accuracy follows the configured store, exactly as Stratal's own throttling does: exact in memory, best-effort on KV, where concurrent writes from different edge locations may undercount. **If you pass your own `rateLimit.customStorage`, it must now implement `consume`** — Better Auth no longer accepts `get`/`set`.

### Database

- Add `createPoolFactory(env, makePool)` to `@stratal/framework/database`, which chooses connection topology from the environment instead of hard-coding it. Write `const pool = createPoolFactory(env, () => new Pool(config))`, then `dialect: () => new PostgresDialect({ pool })`. By default it returns a fresh pool per resolution, which is mandatory on the Workers runtime, where a pool opened in one request's I/O context cannot be reused by a later one without the runtime cancelling the cross-request I/O and hanging the request. The pool is created lazily on first query, so nothing opens a socket at module scope. In production Hyperdrive fronts these pools, so they never accumulate.
- Resolve a connection's database client once per request instead of once per injection. The client was transient, so a request resolving a controller, a guard and four services built six clients over six pools for work that shares a single I/O context. Every entrypoint already runs inside a request scope, so no caller changes. Sharing one client also makes the reentrant-`$transaction` guard effective across services, where separate clients could previously deadlock on a small pool.
- Await the configuration factory in `DatabaseModule.forRootAsync`. A factory that actually returned a promise handed initialization a `Promise` and it walked `undefined` connections. An asynchronous factory now works as documented, which is what lets a consumer put a generated schema behind an `import()` rather than evaluating a large schema module while the isolate starts.
- Make disposing a shared test-harness database connection idempotent, so shutdown no longer logs "Called end on pool more than once". Fresh-per-resolution pools used in dev, staging and production are unchanged.

### Breaking Changes

- **The validation API is `zod/mini`.** The `z` re-export is gone from the validation surface this package re-exports. Import schema builders directly from `zod/mini` using named imports and replace classic chaining with the functional API: `z.string().min(1).optional()` becomes `optional(string().check(minLength(1)))`. Use `describe()` and `named()` from `stratal/validation` for descriptions and OpenAPI component ids.
- **OpenAPI documents are generated lazily**, on the first request to the docs endpoint. `OpenAPIService.getSpec()` becomes `getSpec(container)` and is async, and `routeFilter` is now a metadata predicate `(route: RouteSchemaMeta) => boolean` instead of `(path, pathItem)`.
- **Guards now deny when `canActivate` returns `false`**, with `GuardRejectedError` (403), instead of the return value being ignored. Audit your `canActivate` implementations before upgrading — requests that previously reached the handler now 403. `GuardRejectedError` is re-exported from `@stratal/framework/guards`, so apps that standardise on that path can `instanceof` it without a second import.
- **A custom Better Auth `rateLimit.customStorage` must implement `consume`**, replacing the previous `get`/`set` pair.
