---
"@stratal/testing": patch
---

Allow tests to install a custom `ExceptionHandler` via `TestingModuleConfig`

`TestingModuleBuilder` now accepts `exceptionHandler` on its config, mirroring `ApplicationConfig.exceptionHandler`. This is the only way to swap the handler in tests because the framework resolves it during `app.initialize()`, which runs before `overrideProvider(DI_TOKENS.ExceptionHandler)` can take effect.
