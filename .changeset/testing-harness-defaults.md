---
"@stratal/testing": patch
---

Safer-by-default test harness: rate limiting off, in-memory email, eager routing

### Details

- Rate limiting is now disabled by default (`NoopRateLimiterStore`) — suites fire many requests from one "IP" in seconds and tripped production limiter budgets (including Better Auth's built-in per-path limits). Suites testing limiter behavior must override `RATE_LIMITER_TOKENS.Store` back to a real store (e.g. `InMemoryRateLimiterStore`)
- A `TestEmailProvider` is installed by default so the sync queue provider's inline `EmailConsumer` no longer opens real SMTP connections from the test worker; assert on sent messages via `module.sentEmails`
- Routing is initialized eagerly during `compile()` — configuration errors (e.g. mixing `@Route()` with HTTP method decorators) now surface as a `compile()` rejection instead of on the first request, and request-scoped router services resolve regardless of test ordering
- `compile()` now tears down the partially built `Application` when it fails, so module-held resources (DB pools, timers) don't leak from a failed build
