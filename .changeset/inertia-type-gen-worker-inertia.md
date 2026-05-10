---
"@stratal/inertia": patch
---

Run Inertia type generation in a worker thread and cache dev CSS per HMR cycle

- The Vite types plugin now offloads `runTypeGeneration` to a debounced (250ms) worker via `node:worker_threads`, so HMR no longer blocks on ts-morph parsing. A second edit while a worker is in flight queues exactly one follow-up run, and the dispatcher is torn down on `closeBundle`.
- `writeInertiaTypes` skips the write when the on-disk content already matches and otherwise writes via a temp-file rename, so the file is never observed half-written.
- `stratalInertiaDevCss` caches the collected SSR CSS and invalidates it on CSS-module HMR, eliminating duplicate scans when the SSR endpoint and the virtual module are both requested.
- Component names with `-`, `_`, or whitespace now PascalCase correctly when forming `<Name>PageProps` (e.g. `user-profile/edit` → `UserProfileEditPageProps`).
