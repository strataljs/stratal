---
"@stratal/inertia": patch
---

Add `--persist-to` option to `inertia:dev` for shared emulator state

The `inertia:dev` command now accepts a `--persist-to=<dir>` flag that is forwarded to `@cloudflare/vite-plugin` as `persistState.path`. This lets multiple workers running in development share the same R2, KV, and cache emulator state.
