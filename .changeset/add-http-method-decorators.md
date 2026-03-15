---
"stratal": patch
---

Add HTTP method decorators (`@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`, `@All`) for explicit route handling as an alternative to convention-based `@Route()` routing

### Details

- **stratal**
  - Add `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`, and `@All` decorators that accept an explicit path and optional `RouteConfig`
  - Routes decorated with `@All` are automatically hidden from OpenAPI documentation
  - Enforce mutual exclusivity: a controller cannot mix `@Route()` with HTTP method decorators
  - Add `statusCode` option to `RouteConfig` for explicit status code control in HTTP method decorators
  - Add `HttpRouteMetadata` type and `'all'` to the `HttpMethod` union
  - Remove `statusCode` from the `@Route()` decorator signature (status codes are auto-derived from method names in convention-based routing)
  - Export new decorators and helpers (`getHttpRouteMetadata`, `getHttpDecoratedMethods`) from `stratal/router`
