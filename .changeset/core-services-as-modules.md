---
"stratal": minor
---

Reorganize core subsystem registries into modules

The event, cron, quarry, and seeder registries — previously registered imperatively in `Application` — are now declared as ordinary `@Module`s (`EventsModule`, `CronModule`, `QuarryModule`, `SeederModule`), consistent with every other subsystem. The `Application` constructor now only sets up the bootstrap kernel (`ExceptionHandler`, `LazyModuleLoader`, logging); all module registration happens during initialization. `application.ts` has no static subsystem imports — every built-in module is loaded via dynamic `import()`.

### Breaking Changes

- **`EventRegistry`, `QuarryRegistry`, `CronManager`, `SeederRegistry` are now `@Singleton`** (they were `@Transient` but always force-registered as singletons). This aligns the class decorator with their actual lifecycle; their canonical DI tokens are declared on the decorator.
- **`SeederRegistry` now injects the `Application`** (`@inject(DI_TOKENS.Application)`) instead of being constructed manually.
- **`@stratal/framework` `DatabaseModule.onInitialize` is now `async`** and loads `EventsModule` on demand via `LazyModuleLoader` (the event registry is no longer eagerly registered). No change is required for apps that use `DatabaseModule` normally.
- New public modules are exported from their sub-paths: `EventsModule` (`stratal/events`), `CronModule` (`stratal/cron`), `QuarryModule` (`stratal/quarry`), `SeederModule` (`stratal/seeder`).
- The `schedule:list` command now lazy-loads `CronModule` via `LazyModuleLoader` rather than injecting `DI_TOKENS.Cron`; with no jobs registered it prints "No cron jobs found" instead of failing to resolve.
