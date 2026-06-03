# @stratal/inertia

## 0.0.22

### Patch Changes

- 1658945: Add `createClientViteConfig` helper, client manifest injection, sourcemap option, and `InertiaQuarryModule` for CLI integration

  - New `createClientViteConfig()` produces a ready-made Vite config for the client bundle with automatic reflect-metadata invocation for tsyringe compatibility.
  - Inertia build command now injects the client manifest into the SSR bundle for asset resolution.
  - Type generator enhanced to extract controller page prop types with promise unwrapping.
  - New `@stratal/inertia/quarry` export provides `InertiaQuarryModule` for registering Inertia CLI commands.

- 4b273ea: Replace @intlify/core-base with intl-messageformat in `useI18n` hook, add eager deferred prop resolution, and remove tsyringe/reflect-metadata dependencies

  - `useI18n()` now uses `intl-messageformat` for ICU message formatting. The hook API is unchanged.
  - New `x-inertia-resolve-deferred` request header causes all deferred props to be resolved eagerly in the response, skipping client-side lazy loading.
  - The `invokeReflectMetadataBeforeTsyringeCheck` Vite plugin is removed (no longer needed).
  - `reflect-metadata` and `@intlify/core-base` are no longer peer dependencies.

- Updated dependencies [1658945]
- Updated dependencies [1658945]
- Updated dependencies [4b273ea]
- Updated dependencies [4b273ea]
  - @stratal/testing@0.0.22
  - stratal@0.0.22

## 0.0.21

### Patch Changes

- 3489cfd: Dedupe React and Inertia in the Vite resolver to prevent duplicate-copy bugs

  `stratalInertia()` now adds the React ecosystem (`react`, `react-dom`, `react-is`, `scheduler`, `use-sync-external-store`) and `@inertiajs/core` / `@inertiajs/react` to `resolve.dedupe` and `resolve.noExternal`. React 19's main entry is CJS and must run through the optimizer, but when Vite re-runs optimization after auto-discovering a new dep it would mint a second `?v=<hash>` copy, breaking React identity (`Invalid hook call`, dispatcher mismatch). Forcing a single physical copy through `dedupe`/`noExternal` keeps hooks, contexts, and Inertia internals working across re-optimizations.

- 3489cfd: Run Inertia type generation in a worker thread and cache dev CSS per HMR cycle

  - The Vite types plugin now offloads `runTypeGeneration` to a debounced (250ms) worker via `node:worker_threads`, so HMR no longer blocks on ts-morph parsing. A second edit while a worker is in flight queues exactly one follow-up run, and the dispatcher is torn down on `closeBundle`.
  - `writeInertiaTypes` skips the write when the on-disk content already matches and otherwise writes via a temp-file rename, so the file is never observed half-written.
  - `stratalInertiaDevCss` caches the collected SSR CSS and invalidates it on CSS-module HMR, eliminating duplicate scans when the SSR endpoint and the virtual module are both requested.
  - Component names with `-`, `_`, or whitespace now PascalCase correctly when forming `<Name>PageProps` (e.g. `user-profile/edit` → `UserProfileEditPageProps`).

- Updated dependencies [3489cfd]
- Updated dependencies [3489cfd]
- Updated dependencies [3489cfd]
  - stratal@0.0.21
  - @stratal/testing@0.0.21

## 0.0.20

### Patch Changes

- f8c61e1: Expose the matched route on `useRoute()` and apply trailing-slash + sticky params

  The `routes` Inertia shared prop now also carries a `route` snapshot for the current request (`{ name, params, defaults }`) and the application's `trailingSlash` mode, enabling several `useRoute()` enhancements:

  - `currentRoute` is returned alongside `route` and `current`, so components can read the matched route name and params directly (e.g. `currentRoute.params.id`).
  - `current(name)` now accepts dotted wildcard patterns derived from real route names (e.g. `current('users.*')`), strictly typed against `StratalRouteMap`.
  - `route(name, params)` merges sticky defaults from `Uri.defaults()` and any current-route params declared by the target route, so values like `tenantId` carry over without the caller passing them. Explicit params still win.
  - Generated URLs respect the server's `trailingSlash` mode.
  - Catch-all path params (e.g. `:slug{.+}`) preserve forward slashes when encoded, matching the server-side behavior.

  Also exports `resolveUrl`, `matchCurrent`, and `applyTrailingSlash` as pure helpers for non-React callers and tests.

- f8c61e1: Skip response mutation for non-cloneable status codes

  The Inertia middleware would crash with a `RangeError` when the downstream handler returned a response whose status fell outside `200-599` (e.g. WebSocket upgrades using `101`, or `Response.error()`'s status `0`), because adding the `Vary` header forces Hono to re-construct the `Response` and the constructor rejects those statuses. The middleware now passes such responses through untouched. The `302 → 303` rewrite for non-GET/HEAD Inertia requests is now scoped to only run when the status is exactly `302`.

- f8c61e1: Loosen peer dependency ranges for broader compatibility

  Peer dependencies (`@inertiajs/*`, `hono`, `react`, `react-dom`, `vite`, `vitest`, `@intlify/core-base`, `reflect-metadata`, `stratal`) now use `>=` ranges instead of pinned `^` ranges, so apps can adopt newer majors of these packages without waiting for a coordinated bump.

- f8c61e1: Exclude `hono`, `stratal`, and Hono OpenAPI plugins from Vite pre-bundling

  `stratalInertia()` now adds `stratal`, `hono`, `@hono/zod-openapi`, and `@hono/swagger-ui` to `optimizeDeps.exclude`. Pre-bundling those packages produced duplicate copies in `.vite/deps_<env>/`, so Response objects from one instance flowed into a Hono Context from the other and crashed inside the `set res` setter (`this.#res.headers.entries is not a function`). Excluding them keeps a single shared instance.

- Updated dependencies [f8c61e1]
- Updated dependencies [f8c61e1]
- Updated dependencies [f8c61e1]
- Updated dependencies [f8c61e1]
- Updated dependencies [f8c61e1]
  - stratal@0.0.20
  - @stratal/testing@0.0.20

## 0.0.19

### Patch Changes

- 5d26c24: Add `--persist-to` option to `inertia:dev` for shared emulator state

  The `inertia:dev` command now accepts a `--persist-to=<dir>` flag that is forwarded to `@cloudflare/vite-plugin` as `persistState.path`. This lets multiple workers running in development share the same R2, KV, and cache emulator state.

- Updated dependencies [3b16f5b]
- Updated dependencies [5d26c24]
- Updated dependencies [3b16f5b]
- Updated dependencies [3b16f5b]
- Updated dependencies [3b16f5b]
- Updated dependencies [5d26c24]
- Updated dependencies [5d26c24]
- Updated dependencies [3b16f5b]
  - stratal@0.0.19
  - @stratal/testing@0.0.19

## 0.0.18

### Patch Changes

- c9176ea: Add precognition support, i18n integration, flash messages, React hooks, and testing utilities

  ### Details

  - Add precognition middleware for form validation without full submission
  - Add i18n integration with automatic locale and translation sharing to Inertia pages
  - Add flash message support via cookie-based flash store
  - Add `useRoute` and `useI18n` React hooks (`@stratal/inertia/react`)
  - Add `@stratal/inertia/testing` subpath with TestResponse assertion augments for Inertia responses
  - Enhance Vite configuration with Cloudflare Vite plugin support

- 17f8675: Add Inertia.js v3 server adapter for building server-driven React SPAs with Stratal

  ### Details

  - `InertiaModule` with `forRoot()` / `forRootAsync()` configuration
  - `InertiaService` for rendering pages with shared data, deferred props, and partial reload support
  - `@InertiaRoute()` decorator for Inertia-specific controller routes
  - Inertia middleware for handling `X-Inertia` protocol (version checking, 409 conflict responses)
  - Vite integration with dev CSS injection and automatic type generation plugins
  - SSR rendering support via `@inertiajs/react/server`
  - Quarry CLI commands: `inertia:dev`, `inertia:build`, `inertia:install`, `inertia:types`

- Updated dependencies [fcb71c4]
- Updated dependencies [17f8675]
- Updated dependencies [c9176ea]
- Updated dependencies [c9176ea]
- Updated dependencies [c9176ea]
  - stratal@0.0.18
  - @stratal/testing@0.0.18
