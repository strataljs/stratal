---
"@stratal/framework": patch
---

Auto-wire Better Auth's rate limiting through Stratal's `RateLimiterModule`

When `RateLimiterModule` is imported alongside `AuthModule`, Better Auth's `rateLimit` block is configured automatically:

- `customStorage` is backed by Stratal's shared `IRateLimiterStore`, so HTTP throttling and Better Auth share one store.
- `customRules` is populated from a new `RateLimiterRegistry.forPath(path, resolver)` API, letting apps declare path-keyed limits (e.g. `/sign-in/email`, `/two-factor/*`) using the same `Limit` builder used elsewhere.
- User-supplied `rateLimit.customStorage` and `rateLimit.customRules` keys take precedence on a per-key basis.

```ts
limiter.forPath('/sign-in/email', () => Limit.perSeconds(10, 3))
limiter.forPath('/forget-password', () => Limit.none()) // disabled
```

Path-keyed entries are scoped per-IP+path by Better Auth (`Limit.by(...)` is ignored), and multiple `Limit`s reduce to the most restrictive (smallest `max / windowSeconds`).
