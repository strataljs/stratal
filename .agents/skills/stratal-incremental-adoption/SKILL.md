---
name: stratal-incremental-adoption
description: >-
  Use when mounting Stratal into an existing Hono application for gradual migration,
  coexisting queue consumers and cron jobs, or incrementally adopting Stratal without
  rewriting an entire codebase.
  Trigger on: incremental adoption, existing Hono app, mount Stratal, sub-app,
  app.route, stratal.hono, migrate from Hono, gradual migration, coexisting queues,
  coexisting cron, legacy Hono, mount sub-app.
user-invocable: false
license: MIT
metadata:
  author: Temitayo Fadojutimi
  version: "1.0"
---

# Incremental Adoption — Mounting Stratal into an Existing Hono App

Stratal exposes its underlying `HonoApp` (which extends `OpenAPIHono`) via the `stratal.hono` getter. This lets you mount a Stratal instance as a sub-app inside an existing Hono application, adopting it incrementally without rewriting everything at once.

Full documentation: [Incremental Adoption](https://stratal.dev/getting-started/incremental-adoption)

## Mounting Stratal into an Existing Hono App

Create a `Stratal` instance with your module, then mount it using Hono's `app.route()`:

```ts
// stratal-app.ts
import { Stratal } from 'stratal'
import { UsersModule } from './users/users.module'

export const stratal = new Stratal({ module: UsersModule })
```

```ts
// index.ts
import { Hono } from 'hono'
import { stratal } from './stratal-app'

const app = new Hono()

// Existing routes
app.get('/health', (c) => c.json({ status: 'ok' }))

// Mount Stratal under /api
const stratalHono = await stratal.hono
app.route('/api', stratalHono)

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch) {
    await stratal.queue(batch)
  },
  async scheduled(controller: ScheduledController) {
    await stratal.scheduled(controller)
  },
}
```

`stratal.hono` returns `Promise<HonoApp>` — you **must** `await` it once at the top level. CF Workers supports top-level `await` in ES module format.

## Gradual Migration Strategy

Move one feature at a time into Stratal modules while keeping everything else in your existing Hono app:

1. **Pick a feature** — Start with a self-contained feature (e.g., user management).
2. **Create a Stratal module** — Move routes, services, and logic into a module with controllers and providers.
3. **Mount under a prefix** — Use `app.route()` to mount Stratal at the same path your existing routes used.
4. **Remove old routes** — Delete the original Hono handlers for the migrated feature.
5. **Repeat** — Continue until your entire app runs on Stratal.

```ts
import { Hono } from 'hono'
import { stratal } from './stratal-app'

const app = new Hono()

// Migrated to Stratal
const stratalHono = await stratal.hono
app.route('/api/v2', stratalHono)

// Legacy routes still served by plain Hono
app.get('/api/v1/reports', (c) => c.json({ reports: [] }))
app.post('/api/v1/webhooks', (c) => c.json({ received: true }))

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch) {
    await stratal.queue(batch)
  },
  async scheduled(controller: ScheduledController) {
    await stratal.scheduled(controller)
  },
}
```

## Coexisting Queue Consumers and Cron Jobs

When you mount Stratal with `app.route()`, only HTTP routing is connected. Queue consumers and cron handlers are **not** part of the Hono routing layer — they must be explicitly forwarded from your worker's export.

### Scenario A: Only Stratal handles queues/cron

If all queue consumers and cron jobs live in Stratal modules, delegate directly:

```ts
export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch) {
    await stratal.queue(batch)
  },
  async scheduled(controller: ScheduledController) {
    await stratal.scheduled(controller)
  },
}
```

### Scenario B: Both old and new handlers coexist

During migration, you may have legacy queue/cron logic that hasn't been moved to Stratal modules yet. Use a dispatcher pattern:

```ts
import { Hono } from 'hono'
import { stratal } from './stratal-app'
import { handleLegacyQueue, handleLegacyCron } from './legacy-handlers'

const app = new Hono()
const stratalHono = await stratal.hono
app.route('/api', stratalHono)

// Queue names managed by Stratal modules
const stratalManagedQueues = ['notifications-queue', 'email-queue']

export default {
  fetch: app.fetch,

  async queue(batch: MessageBatch, env: unknown, ctx: ExecutionContext) {
    if (stratalManagedQueues.includes(batch.queue)) {
      return stratal.queue(batch)
    }
    // Legacy queue handler
    await handleLegacyQueue(batch, env, ctx)
  },

  async scheduled(controller: ScheduledController, env: unknown, ctx: ExecutionContext) {
    // Run both — Stratal only triggers jobs matching the cron schedule
    await stratal.scheduled(controller)
    await handleLegacyCron(controller, env, ctx)
  },
}
```

**How queue dispatching works:** `stratal.queue(batch)` internally routes messages by their `type` field (the `messageTypes` property on each consumer), not by queue name. The `batch.queue` name is passed for logging only. If no consumer's `messageTypes` match a message's type, that message is silently skipped.

**How cron dispatching works:** `stratal.scheduled(controller)` uses `CronManager.executeScheduled()` which matches `controller.cron` against each job's `schedule` property. Only jobs whose schedule matches the triggered cron expression run — non-matching schedules are no-ops. This makes it safe to call `stratal.scheduled()` for every trigger alongside legacy cron logic.

### Scenario C: Fully migrated

Once all queues, cron jobs, and routes are in Stratal modules, simplify to:

```ts
import { Stratal } from 'stratal'
import { AppModule } from './app.module'

export default new Stratal({ module: AppModule })
```

## Caveats and Edge Cases

### Async initialization

`stratal.hono` returns `Promise<HonoApp>` because Stratal bootstraps asynchronously — resolving modules, building the DI container, and registering routes during initialization. You must `await` it once at the top level. CF Workers supports top-level `await` in ES module format. **Do not** call `stratal.hono` inside a request handler — await it once and reuse the resolved instance.

### DI container isolation

Stratal manages its own DI container. Services registered in Stratal's container are **not** available to plain Hono handlers, and vice versa. If you need shared state between the two layers, use Cloudflare bindings (KV, D1, etc.) or migrate the shared logic into a Stratal provider.

### Request-scoped containers

Each request hitting a Stratal route gets its own request-scoped DI container, created by Stratal's internal middleware and disposed after the response. Requests handled by plain Hono routes bypass this entirely — they have no access to request-scoped services.

### Middleware ordering

Middleware registered in the outer Hono app runs before Stratal's middleware chain:

```
Request
  -> Outer Hono middleware
  -> Stratal request-scoped container setup
  -> Stratal user-defined middleware
  -> Stratal guards
  -> Stratal route handler
  -> Response
```

Auth/logging middleware may need dual configuration during the transition period.

### Error handling boundary

Stratal catches all errors via its own `onError` handler and returns JSON error responses. Errors thrown within Stratal routes do **not** bubble up to the outer Hono app's error handler. Error response formatting may differ between Stratal and legacy routes during migration.

### OpenAPI coverage

Only Stratal routes appear in generated OpenAPI docs. Legacy Hono routes won't be included. As routes are migrated into Stratal modules, they automatically appear in the spec.

### Environment bindings

Stratal eagerly imports `cloudflare:workers` for env at construction time via `prepareApp()`. The outer Hono app's env and ctx are passed through to Stratal's `HonoApp.fetch()` at request time via Hono's standard binding mechanism when mounted with `app.route()`.

## Do's and Don'ts

- **Do** `await stratal.hono` once at the top level, not per-request
- **Do** use a queue/cron dispatcher when coexisting with legacy handlers
- **Do** migrate one feature at a time — pick self-contained features first
- **Do** explicitly wire `queue` and `scheduled` exports — `app.route()` only connects HTTP
- **Do** align error response formatting between Stratal and legacy routes if consistency matters
- **Don't** share services between Stratal DI and plain Hono handlers — use CF bindings instead
- **Don't** call `stratal.hono` inside a request handler — it returns a Promise and should be awaited once
- **Don't** forget to configure auth/middleware in both layers during the transition period
- **Don't** expect legacy Hono routes to appear in Stratal's OpenAPI docs
