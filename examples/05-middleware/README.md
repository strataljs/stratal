# 05 - Middleware

Middleware configuration using `MiddlewareConfigurable` and `MiddlewareConsumer`.

## What it demonstrates

- Custom middleware implementing the `Middleware` interface
- `MiddlewareConfigurable` on the root module to configure middleware
- `consumer.apply().exclude().forRoutes()` fluent API
- Excluding specific routes from middleware (e.g. health checks)

## Running

```bash
cd examples/05-middleware
npx wrangler dev
```

## Testing

```bash
# This route is logged by the middleware
curl http://localhost:8787/api/hello

# This route is excluded from logging
curl http://localhost:8787/api/health
```

Check the wrangler console output to see the request logger in action.

## Key files

- [`src/app.module.ts`](src/app.module.ts) - Module with middleware configuration
- [`src/middleware/request-logger.middleware.ts`](src/middleware/request-logger.middleware.ts) - Request logger middleware
- [`src/health/health.controller.ts`](src/health/health.controller.ts) - Health controller (excluded from logging)
