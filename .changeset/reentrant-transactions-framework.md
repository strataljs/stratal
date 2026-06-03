---
"@stratal/framework": patch
---

Make database transactions reentrant and remove `AuthContextMiddleware`

- Nested `$transaction` calls now reuse the active transaction instead of acquiring a second connection, fixing deadlocks on single-connection pools (e.g. Hyperdrive with `max: 1`) when libraries such as Better Auth run nested transactions.

### Breaking Changes

- **`AuthContextMiddleware` is removed.** Auth context is now registered automatically per request. If you registered this middleware explicitly, remove the registration — `SessionVerificationMiddleware` is sufficient.
