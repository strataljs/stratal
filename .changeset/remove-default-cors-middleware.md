---
"stratal": patch
---

Remove default CORS middleware from HonoApp

### Breaking Changes

- **stratal**: `HonoApp` no longer applies `cors()` middleware by default. If your application relies on the built-in CORS handling, add it explicitly via a custom middleware in your module's `configure()` method or by registering it globally.
