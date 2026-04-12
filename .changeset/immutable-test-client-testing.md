---
"@stratal/testing": patch
---

Make `TestHttpClient` immutable and extend test classes with `Macroable`

- `TestHttpClient.forHost()`, `withHeaders()`, and `withLocale()` now return new instances instead of mutating `this`, preventing shared state between tests.
- `TestHttpRequest` and `TestResponse` now extend `Macroable`, allowing apps to register custom assertion methods and helpers at runtime.
- Add `TestingModule.inertia` getter for convenient Inertia request testing.
