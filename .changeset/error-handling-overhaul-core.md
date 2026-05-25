---
"stratal": patch
---

Overhaul error handling, rename queue "name" to "binding", add i18n CLI commands, and introduce QuarryRunner

### Breaking Changes

- **`ApplicationError`** — Constructor changed from `(i18nKey, code, metadata?)` to `(message?, cause?)`. Remove error code and i18n key arguments from any subclass `super()` calls. The `code`, `metadata`, `toErrorResponse()`, `toJSON()`, `report()`, and `render()` members are removed.
- **Error codes removed** — `ERROR_CODES` registry and `ErrorCode` type are deleted. Use plain error messages or custom properties on `HttpException` subclasses instead.
- **Per-module error consolidation** — Individual error classes (e.g. `QueueBindingNotFoundError`, `CacheGetError`, `ConfigModuleNotInitializedError`) are replaced by single per-module error classes (`QueueError`, `CacheError`, `ConfigError`, etc.). Update any `catch` blocks or `instanceof` checks.
- **Queue "name" → "binding"** — `@InjectQueue('queue-name')` now takes the exact Cloudflare binding key (e.g. `BACKGROUND_QUEUE`) instead of a kebab-case name. The automatic `kebab-case → UPPER_SNAKE_CASE` conversion is removed. Rename all queue references to match your `wrangler.jsonc` binding names.
- **`withI18n` renamed to `withZodI18n`** — Update imports from `stratal/i18n` accordingly.
- **Logger transport system removed** — `ConsoleTransport`, `BaseTransport`, and the transport plugin interface are deleted. The logger now writes directly to console.
- **`ExceptionHandler` simplified** — The handler no longer translates i18n message keys or builds `ErrorResponse` objects. It renders errors using `HttpException.status` and plain messages.
