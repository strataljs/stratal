---
"stratal": patch
---

Add `RateLimiterModule` for request throttling with KV and in-memory stores

- New opt-in `RateLimiterModule` configurable with `forRoot({ store: 'kv', binding })` or `forRoot({ store: 'memory' })` (or a custom `IRateLimiterStore`).
- `Limit` builder API with `perSecond`, `perSeconds`, `perMinute`, `perMinutes`, `perHour`, `perDay`, and `none()` helpers; `.by(key)` scopes per-actor and `.response(handler)` overrides the default 429.
- `RateLimiterRegistry.for(name, resolver)` defines named limiters; apply them with `router.throttle(name)` or the `@RateLimit(name)` decorator on controllers and route methods.
- `TooManyRequestsError` returns HTTP 429 with `Retry-After` and `X-RateLimit-*` headers automatically; the body honors content negotiation (JSON, HTML, Inertia).
- Misconfiguration surfaces at boot (missing `forRoot`) rather than on the first throttled request.
