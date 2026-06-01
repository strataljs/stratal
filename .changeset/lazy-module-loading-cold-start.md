---
"stratal": minor
---

Add lazy module loading and reduce cold start by loading built-in subsystems on demand

### New: `LazyModuleLoader`

Inject `LazyModuleLoader` (or resolve `DI_TOKENS.LazyModuleLoader`) to load a module at runtime, NestJS-style:

```ts
const ref = await loader.load(() => import('./reports.module').then(m => m.ReportsModule))
ref.get(ReportService)
```

The loaded module's nested `imports` and `providers` are registered into the global container and its `onInitialize` hook runs once. Repeat loads return the cached `ModuleRef`. Controllers, queue consumers, and cron jobs declared by a lazily loaded module are skipped (with a warning) — that wiring is finalized at bootstrap.

### Breaking Changes

- **Built-in subsystems are no longer registered eagerly at boot.** `I18nModule`, `QueueModule`, `CacheModule`, `OpenAPIModule`, the cron manager, and router services are now loaded via dynamic `import()` at their trigger points (i18n/routing on the first HTTP request, queue on the first batch, cron on the first scheduled invocation or when the app declares jobs). HTTP-only apps no longer evaluate queue/cron code at cold start.
- **`CacheService` is no longer globally available unless `CacheModule` is loaded.** `RateLimiterModule` now imports `CacheModule` itself; apps that relied on the implicit global `CacheService` must import `CacheModule` (or use `LazyModuleLoader`).
- **`Application.initializeHandlers()` is removed.** Non-HTTP entrypoints (Durable Objects, Workflows, WorkerEntrypoints) now use `Application.ensureScopedHandlers()` via the internal `runInScope` helper — no action required for typical apps.
