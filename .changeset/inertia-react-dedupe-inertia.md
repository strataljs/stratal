---
"@stratal/inertia": patch
---

Dedupe React and Inertia in the Vite resolver to prevent duplicate-copy bugs

`stratalInertia()` now adds the React ecosystem (`react`, `react-dom`, `react-is`, `scheduler`, `use-sync-external-store`) and `@inertiajs/core` / `@inertiajs/react` to `resolve.dedupe` and `resolve.noExternal`. React 19's main entry is CJS and must run through the optimizer, but when Vite re-runs optimization after auto-discovering a new dep it would mint a second `?v=<hash>` copy, breaking React identity (`Invalid hook call`, dispatcher mismatch). Forcing a single physical copy through `dedupe`/`noExternal` keeps hooks, contexts, and Inertia internals working across re-optimizations.
