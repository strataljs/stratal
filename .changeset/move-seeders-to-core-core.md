---
"stratal": patch
---

Move seeders from standalone `@stratal/seeders` package into core as `stratal/seeder`

### Details

- Add `Seeder` abstract base class with `run()` and `call(OtherSeeder)` methods
- Add `SeederRegistry` for seeder registration and execution
- Auto-discover seeders from module `providers` (any class extending `Seeder`)
- Add built-in Quarry commands: `db:seed {name?} {--all}`, `db:seed:list`
- Seeders execute within request-scoped DI containers with full access to injected services
- Use DI-resolved seeders instead of manual instantiation
- Route unexpected command errors through `GlobalErrorHandler`
- Remove standalone `packages/seeders` package — all seeder functionality now lives in core
- New sub-path export: `stratal/seeder`
