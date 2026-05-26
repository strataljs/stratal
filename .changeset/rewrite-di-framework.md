---
"@stratal/framework": patch
---

Adapt to the new built-in DI container from `stratal`, removing all `tsyringe` and `reflect-metadata` usage

- All request-scoped services now use the `@Request` decorator instead of `@Transient`.
- `DatabaseModule` uses `lazy()` for dynamic connection registration instead of tsyringe's `delay()`.
- `reflect-metadata` is no longer required as a peer dependency.
