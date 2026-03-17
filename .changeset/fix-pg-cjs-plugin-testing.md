---
"@stratal/testing": patch
---

Add `fixPgCjs()` Vite plugin for CJS resolution of pg sub-dependencies in workerd

### Details

- Replace the `@cloudflare/vitest-pool-workers` yarn patch with a dedicated `fixPgCjs()` Vite plugin
- `fixPgCjs()` must be applied at the root `defineConfig` level for the module fallback resolver to work correctly
- `stratalTest()` does NOT automatically apply `fixPgCjs()` — it must be registered separately at the root level
- Upgrade `@cloudflare/vitest-pool-workers` to ^0.13.2 (unpinned)