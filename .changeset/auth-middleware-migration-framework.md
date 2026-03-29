---
"@stratal/framework": patch
---

Migrate auth middleware to router-scoped configuration and improve error resilience

### Details

- Migrate `AuthModule` from `MiddlewareConfigurable` to `RouteConfigurable` interface
- Add graceful error handling in session verification to prevent invalidated sessions from blocking requests
- Expand Better Auth error mapping for token expiry, signup, and session creation failures
- Use duck-typing for Better Auth `APIError` detection to handle bundler environments
