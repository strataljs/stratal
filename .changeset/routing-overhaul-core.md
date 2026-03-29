---
"stratal": patch
---

Add Laravel-style routing with named routes, URI generation, signed URLs, domain routing, and response validation

### Details

- Add `Uri` service for generating URLs from named routes with parameter binding
- Add signed URL support with HMAC-based signature generation and verification
- Add domain-based routing with `@Route({ domain })` and domain middleware
- Add response validation to verify route handler responses match OpenAPI schemas
- Add `RouteRegistry` for route name lookups and `RouteMap` for serialized route definitions
- Add `RouterResolver` for programmatic route resolution and middleware chain composition
- Add `LocalePathService` for locale-aware URL path handling
- Add `route:types` Quarry command for generating typed route helpers
- Replace module-level middleware system with router-scoped middleware via `RouteConfigurable`

### Breaking Changes

- The `stratal/middleware` subpath export has been removed. Middleware is now configured through the router using `RouteConfigurable` instead of `MiddlewareConfigurable`. Implement `configureRoutes(router: Router)` on your module and use `router.use(...)` to apply middleware.
