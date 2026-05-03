---
"@stratal/inertia": patch
---

Loosen peer dependency ranges for broader compatibility

Peer dependencies (`@inertiajs/*`, `hono`, `react`, `react-dom`, `vite`, `vitest`, `@intlify/core-base`, `reflect-metadata`, `stratal`) now use `>=` ranges instead of pinned `^` ranges, so apps can adopt newer majors of these packages without waiting for a coordinated bump.
