---
"stratal": patch
---

Add configurable content type support for request and response bodies in route definitions

### Details

- Add `RouteBodyObject` and `RouteResponseObject` types with optional `contentType` field
- Support `{ schema, contentType }` object form for `body` and `response` in `@Route()` config
- Bare `ZodType` values default to `application/json` (backward-compatible)
- Export new types: `RouteBody`, `RouteBodyObject`, `RouteResponseObject`
- Add `DEFAULT_CONTENT_TYPE` constant
- Error response schemas always use `application/json` regardless of route content type
