---
"@stratal/inertia-modal": patch
---

Loosen peer dependency ranges for broader compatibility

Peer dependencies (`@inertiajs/core`, `@inertiajs/react`, `hono`, `react`, `reflect-metadata`, `stratal`) now use `>=` ranges instead of pinned `^` ranges, so apps can adopt newer majors of these packages without waiting for a coordinated bump.
