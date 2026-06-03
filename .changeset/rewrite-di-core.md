---
"stratal": patch
---

Replace tsyringe and reflect-metadata with a built-in dependency injection container and switch i18n engine from @intlify/core-base to intl-messageformat

### Breaking Changes

- **`tsyringe` and `reflect-metadata` removed** — All imports from `tsyringe` (`inject`, `injectable`, `container`, `delay`, `Lifecycle`) must be replaced with equivalents from `stratal/di`. Remove `reflect-metadata` from your dependencies and imports.
- **`@Transient` decorator renamed to `@Request`** — Update all `@Transient(TOKEN)` usages to `@Request(TOKEN)` for request-scoped services.
- **`delay()` replaced by `lazy()`** — Replace `delay(() => MyClass)` with `lazy(() => MyClass)` from `stratal/di`.
- **`scope` removed from module providers** — The `scope` option on `ClassProvider` is removed. Scope is now determined by the class decorator (`@Singleton`, `@Request`). Remove `scope: Scope.Singleton` or `scope: Scope.Request` from provider definitions.
- **`Scope` enum simplified** — `Scope.Singleton`, `Scope.Request`, and `Scope.Transient` are still available as types, but are no longer passed to module providers. Use `@Singleton()` or `@Request()` decorators on the class instead.
- **`@intlify/core-base` replaced by `intl-messageformat`** — If you extended `MessageLoaderService` or used `getCoreContext()`, switch to the new `translate(locale, key, params?)` method. The public `I18nService.t()` API is unchanged.
- **`setupI18nCompiler()` removed** — No manual compiler setup is needed. Remove any calls to this function.
- **OpenAPI Swagger UI is now dynamically imported** — No action required; reduces initial bundle size.
