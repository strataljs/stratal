---
"@stratal/framework": patch
---

Rename `AuthModule.withRootAsync` to `AuthModule.forRootAsync` for consistency with core framework naming conventions

### Breaking Changes

- **@stratal/framework**: `AuthModule.withRootAsync()` has been renamed to `AuthModule.forRootAsync()`. Update all usages:
  ```diff
  - AuthModule.withRootAsync({ ... })
  + AuthModule.forRootAsync({ ... })
  ```
