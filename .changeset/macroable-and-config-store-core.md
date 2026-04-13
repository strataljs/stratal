---
"stratal": patch
---

Add `Macroable` base class for dynamic method registration and introduce `ConfigStore` for request-scoped configuration

- Add `Macroable` class (inspired by Laravel/AdonisJS) that supports `macro()`, `instanceProperty()`, and `getter()` for runtime method registration with full inheritance support.
- Introduce `ConfigStore` as a singleton source of truth for validated config, making `ConfigService` request-scoped with per-request overrides via `set()` and `reset()`.
- `ConfigService` now extends `Macroable`, allowing apps to add domain-specific getters and methods.
