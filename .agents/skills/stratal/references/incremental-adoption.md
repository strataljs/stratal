# Incremental Adoption

Mount Stratal as a sub-app inside an existing Hono application to migrate gradually.

## Mounting Stratal into an Existing Hono App

The `stratal.hono` getter returns a `Promise<HonoApp>` (Hono instance). Await it and mount with `app.route()`:

```typescript
import { Hono } from 'hono'
import { Stratal } from 'stratal'
import { AppModule } from './app.module'

const app = new Hono()
const stratal = new Stratal({ module: AppModule })

// Mount Stratal under /api — all Stratal controllers serve under this prefix
const stratalHono = await stratal.hono
app.route('/api', stratalHono)

export default app
```

Top-level `await` is supported in Cloudflare Workers ESM format.

## Wiring Queues and Cron

`app.route()` only connects HTTP routing. Queue and scheduled handlers must be forwarded explicitly:

```typescript
export default {
  fetch: app.fetch,
  queue: stratal.queue,
  scheduled: stratal.scheduled,
}
```

Or if you have existing queue/cron logic to keep alongside Stratal's:

```typescript
export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch, env: Env, ctx: ExecutionContext) {
    // Route to Stratal or legacy handler based on queue name
    if (batch.queue === 'stratal-queue') {
      return stratal.queue(batch)
    }
    return legacyQueueHandler(batch, env, ctx)
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    // Forward all scheduled events to Stratal
    return stratal.scheduled(controller)
  },
}
```

## Gradual Migration Strategy

1. Create a Stratal module for one feature (e.g., `NotesModule`)
2. Mount Stratal under the same path the old handler used
3. Remove the old Hono handler for that path
4. Repeat for each feature until the outer Hono app is empty
5. Replace the outer Hono app with `export default new Stratal({ module: AppModule })`

## Caveats

### DI Container Isolation

Stratal's DI container is not accessible from plain Hono handlers, and vice versa. To share state between legacy and Stratal code:
- Use Cloudflare bindings (KV, D1, Durable Objects) as the shared layer
- Or migrate the shared service into a Stratal provider and move dependent handlers into Stratal controllers

### Request-Scoped Containers

Stratal only creates request-scoped DI containers for requests that hit Stratal routes. Plain Hono routes outside the mounted sub-app do not get a Stratal request container.

### Middleware Ordering

For requests hitting Stratal routes, middleware executes in this order:
1. Outer Hono middleware (registered on the parent `app`)
2. Stratal container setup (request container creation)
3. Stratal middleware (registered via `MiddlewareConfigurable`)
4. Guards (`@UseGuards()`)
5. Route handler

### Error Handling Boundary

Stratal intercepts errors within its routes via its own `onError` handler. Errors thrown in Stratal controllers do **not** bubble up to the outer Hono app's error handler.

### OpenAPI Coverage

Stratal's generated OpenAPI spec only includes routes defined in Stratal controllers. Legacy Hono routes are not reflected in the OpenAPI documentation.
