# @stratal/inertia

## 0.1.0

### Minor Changes

- ccb3f17: Add build-time SSR exclusion and client-side access control, and fix several dev-runtime failures and oversized generated types.

  - Add build-time SSR exclusion through the `stratalInertia()` Vite plugin's `ssrExclude` option, and remove the runtime SSR opt-out. Client-only pages and their heavy dependencies were previously always bundled into the worker, because the SSR page glob pulled in every page, inflating cold start; disabling SSR at runtime skipped rendering but still shipped the code.
    - `stratalInertia({ ssrExclude: ['Admin/**', 'Reports/Heavy'] })` takes page-component globs, matched against the page name, where `*` is a single segment and `**` any number. Excluded pages are dropped from the worker bundle and rendered client-only, while the browser bundle still includes them so they hydrate normally.
    - Removes `ssr.disabled` and `ctx.withoutSsr()` — see Breaking Changes below.
  - Add client-side access control: the `<Can>`, `<Cannot>`, `<HasRole>` and `<HasNoRole>` components plus the `useCan`, `useRole` and `useAccess` hooks, on a new `@stratal/inertia/react/access` entry. They are gated on permissions the server shares automatically once `accessControl` is configured, and permission strings and role names are type-checked against a generated registry.
    - Also fixes two type-generator bugs that gave page props the wrong types: `ctx.share()` calls were not detected at all, and shared props wrapped in `always()`, `defer()`, `optional()`, `merge()` or `once()` were typed as the wrapper instead of the value it resolves to.
  - Recycle the dev worker when its memory reaches a threshold, fixing frequent dev-server crashes in large apps. Under sustained HMR the Workers dev isolate's heap grows until it hits the V8 limit and the worker aborts, which the browser shows as "Fetch failed". `quarry inertia:dev` now keeps the dev server alive, with a default threshold of 900 MB configurable through `--heap-limit=<MB>`. Supervision runs on macOS and Linux; elsewhere it is disabled with a warning.
  - Skip caching for Inertia pages that cannot be shared between callers, now that responses carry an explicit `Cache-Control` header and `@Cacheable` is available. A page is not cached when it carries flash data, is a partial reload, or contains a `once()` prop. On a cache hit the SSR render is skipped entirely, so a cached page costs no render.
  - Adopt the plain-Hono router and `zod/mini` validation surface. Because this package re-exports the core routing and validation surface, the same migration applies — see Breaking Changes below.
  - Render a modal route's background page client-only when that page is excluded from SSR through `ssrExclude`, and share that decision with full-page renders. A direct visit or refresh of such a modal route previously failed with `Page not found` and a 500, because the combined page was always rendered through SSR instead of honouring the exclusion.
  - Export `DocumentRendererService`, registered under the new `INERTIA_TOKENS.DocumentRenderer` token, which renders a built `Page` into an HTML document `Response` and owns the single decision between streaming SSR and a client-only shell — SSR is skipped when it is unconfigured, or when the page component was build-time excluded through `ssrExclude`. `InertiaService` and `@stratal/inertia-modal` both delegate to it, so that rule lives in one place; anything rendering an Inertia document outside those paths should inject the token rather than duplicate the branch.
  - Rewrite `import.meta.glob` page resolvers that pass a second argument, such as `{ eager: true }` or `{ import: 'default' }`, preserving those options. Only the bare single-argument form was matched before, so option-bearing resolvers silently shipped excluded pages into the worker bundle.
  - Strip react-dom's unused legacy synchronous server renderer from the worker SSR bundle. React's server entry pulls in both the streaming renderer that Stratal uses and a synchronous renderer it never calls, and the way they are required defeats tree-shaking, so the unused build shipped in every worker. On a minimal app the SSR chunk drops around 197 KB raw and 37 KB gzipped, taking the total worker bundle from 1,664 KB to 1,471 KB raw. SSR is streaming-only, so `renderToString` and `renderToStaticMarkup` are not available in the worker.
  - Fix `ReferenceError: require is not defined` returning a 500 on every SSR page under the Workers dev and SSR runtime. React 19's server entry is a CommonJS shim whose conditional require is only resolved by Vite's dependency optimizer, and because this package is excluded from that optimizer to avoid duplicate framework instances, the shim was never converted and its bare `require` reached the worker runtime.
  - Fix `ReferenceError: require is not defined` and `module is not defined` under the Workers dev and SSR runtime when an app uses the ORM data layer (`@zenstackhq/orm`) or the email renderer (`@react-email/render`). Both reach CommonJS sub-dependencies through packages excluded from Vite's optimizer, so they were never converted to ESM. Each is optional and is only included when it resolves from the project.
  - Fix a guest SSR render failing at app init with `createPoolFactory is not a function` under a linked or portal checkout, by excluding `@stratal/framework` from Vite's dependency optimizer alongside `@stratal/inertia` and `stratal`. The optimized database subpath lost its named exports; because the framework also re-exports the core DI tokens and Hono surface, pre-bundling it while the core is excluded could split them into two copies as well.
  - Emit translation-key page props as a type reference again, instead of inlining the whole message-key union. The reference was previously lost once a key union was reached through nested object or array expansion, so such props leaked hundreds of key literals into the generated types, while genuinely narrow literal unions still stay inlined.
  - Stop inlining the full i18n message-key union into page-prop types, which can shrink generated declaration files by an order of magnitude on apps with large key sets.
    - Nullable and optional key unions, such as `InertiaTranslationKeys | null`, no longer defeat detection; the `null` or `undefined` member is stripped for matching and re-attached on the emitted reference.
    - Props covering the full key set now reference `MessageKeys` from `stratal/i18n` rather than being widened to the prefix-filtered `InertiaTranslationKeys`.
    - A prop declared in a file that does not transitively import every message namespace resolves to a strict subset with no recoverable alias; a union that is large both as a fraction of the key space and in absolute size now collapses to the type the source declares, while small hand-picked key enums stay inlined.
    - Key detection is derived from the configured i18n prefixes and resolved inside the source tree, so the app's full key set is in scope.

  ### Breaking Changes

  - **`ssr.disabled` is removed** from `InertiaModule.forRoot({ ssr })`. Replace it with the Vite plugin's `ssrExclude`, which both skips SSR and drops the excluded pages from the worker bundle: `stratalInertia({ ssrExclude: ['Admin/**'] })`.
  - **`ctx.withoutSsr()` and the `withoutSsr` context variable are removed.** SSR exclusion is now build-time and declarative, so there is no per-request runtime opt-out — move the decision into `ssrExclude`.
  - **The validation API is `zod/mini`.** The `z` re-export is gone from the validation surface this package re-exports. Import schema builders directly from `zod/mini` using named imports, and replace classic chaining with the functional API: `z.string().min(1).optional()` becomes `optional(string().check(minLength(1)))`. Use `describe()` and `named()` from `stratal/validation` for descriptions and OpenAPI component ids, since `zod/mini` has no `.describe()` or `.meta()`.
  - **OpenAPI documents are generated lazily**, on the first request to the docs endpoint. `OpenAPIService.getSpec()` becomes `getSpec(container)` and is async, and `routeFilter` is now a metadata predicate `(route: RouteSchemaMeta) => boolean` instead of `(path, pathItem)`.

## 0.0.27

### Patch Changes

- Updated dependencies [41a9140]
  - stratal@0.0.27
  - @stratal/testing@0.0.27

## 0.0.26

### Patch Changes

- ab95f52: Fix flash cookie encoding crashing on non-Latin1 characters

  ### Details

  - Flash cookies are now encoded with UTF-8-safe base64 — `btoa` alone threw on any character outside Latin1 (em-dashes, smart quotes, non-Latin scripts), which are routine in user-facing flash messages

- bb6d3b9: Trailing-slash exclusions: `trailingSlash` accepts `{ mode, exclude }`

  ### Details

  - `trailingSlash` application config now accepts `{ mode, exclude }` alongside a bare mode. Excluded paths are never redirected (308) and never rewritten by URL generation — for routes whose canonical form is owned externally (e.g. OAuth redirect URIs matched byte-for-byte).
  - String patterns are segment-aware prefixes; RegExp patterns match both slash forms of the pathname regardless of anchoring.
  - Exclusions match in route space: with path-based locale detection, a leading locale segment is stripped before matching, so `'/callback'` also exempts `/fr/callback` — in the redirect middleware, `Uri` helpers, and hreflang link generation.
  - `@stratal/inertia` threads the widened config through hreflang URL generation and shares only the resolved mode with the React client (exclusions are server-side; excluded paths are served in both slash forms, so client-built URLs never redirect).
  - New exports from `stratal/router`: `resolveTrailingSlash`, `isTrailingSlashExcluded`, and the `TrailingSlashConfig` / `TrailingSlashOptions` / `TrailingSlashExclude` types.

- Updated dependencies [ab95f52]
- Updated dependencies [ab95f52]
- Updated dependencies [bb6d3b9]
  - stratal@0.0.26
  - @stratal/testing@0.0.26

## 0.0.25

### Patch Changes

- e93db60: Add `--inspector-port` option to `inertia:dev` for configuring the worker debugger inspector port

  Set a distinct port per worker to avoid `EADDRINUSE` when running multiple Inertia workers concurrently, or pass `false` to disable the inspector entirely.

- Updated dependencies [e93db60]
  - stratal@0.0.25
  - @stratal/testing@0.0.25

## 0.0.24

### Patch Changes

- 10cf223: Stream server-side rendering with React 19 for faster TTFB and progressive Suspense rendering

  The document shell (SEO + CSS) now flushes immediately while the app body streams, and `React.lazy`/`Suspense` boundaries stream in progressively instead of blocking the whole response. A new `createInertiaSsrApp` helper from `@stratal/inertia/ssr` wires this up for you. `quarry inertia:install` scaffolds an `src/inertia/ssr.tsx` using it.

  `createInertiaSsrApp` is generic over your page props — call `createInertiaSsrApp<MyProps>({ … })` to type the resolver, or omit the type argument to keep the `import.meta.glob` resolver opaque (the default). A downstream cancellation (client disconnect) now propagates to the React render, and an invalid resolver result throws instead of rendering nothing.

  Also fixes `ssr.disabled` glob matching, which previously compared against the full URL and so missed routes carrying a query string (e.g. `admin/*` vs `/admin/dashboard?tab=users`); it now matches the pathname only. Rerunning `quarry inertia:install` on an existing install now wires the SSR bundle into the current `InertiaModule.forRoot({ … })` instead of leaving SSR silently disabled.

  ### Breaking Changes

  - The SSR bundle now returns a stream, and there is no longer a silent client-side fallback — if SSR fails to load or render, the error surfaces (500) instead of degrading silently.
  - Migrate your `src/inertia/ssr.tsx` to use the new helper:

    ```tsx
    import { createInertiaSsrApp } from "@stratal/inertia/ssr";

    export const { render } = createInertiaSsrApp({
      resolve: async (name) => {
        const pages = import.meta.glob("./pages/**/*.tsx");
        const page = await pages[`./pages/${name}.tsx`]?.();
        if (!page) throw new Error(`Page not found: ${name}`);
        return page;
      },
    });
    ```

    Replace the previous `createInertiaApp` + `renderToString` setup, which returned `{ head, body }`. App-level providers go in the optional `setup` callback. Document metadata should come from server-side `ctx.seo()` — a `<Head>` inside a suspended boundary is not captured during streaming.

  - stratal@0.0.24
  - @stratal/testing@0.0.24

## 0.0.23

### Patch Changes

- 13b0e8d: Add `@stratal/feature-flags` — Cloudflare Flagship feature flags via the native Worker binding API.

  - `FeatureFlagModule.forRoot({ apps: [{ binding, flags }], default, context })` with a declare-once flag manifest, manifest defaults, a per-request evaluation-context resolver, and multi-app support via `FeatureFlagService.use(binding)`.
  - `FeatureFlagShareMiddleware` shares evaluated flags to Inertia pages as the `featureFlags` prop; register it yourself (scoped to page controllers via `router.middleware(...)` or app-wide via `router.use(...)`) so a stalled Flagship binding can't block unrelated routes. Typed `useFlag` / `useFeatureFlags` hooks on `@stratal/feature-flags/react`. No runtime dependency on `@stratal/inertia`.
  - `@stratal/inertia`: expose a generic `ctx.share(key, value)` macro on `RouterContext` so middleware and packages can contribute per-request shared props.
  - `@stratal/framework`: add a `ctx.user()` macro on `RouterContext` (shorthand for `AuthContext.requireUser()`).

- 13b0e8d: Fix correctness and security issues found in review.

  Queue:

  - Retry the correct binding: dispatch stamps the producer binding into message metadata and failed jobs record it, so `queue:retry` re-enqueues through the Cloudflare binding instead of the queue name (which is not a valid binding key and broke retry whenever the two differed). A message with no binding metadata is logged and acked rather than stored as an unretryable job.
  - Honor the documented retry budget: `maxRetries` now counts retries correctly against Cloudflare's 1-based `message.attempts` (previously gave one fewer retry than configured).
  - Derive idempotency keys from an order-stable serialization of `type` + `payload`, so payloads that differ only in key order dedupe correctly.
  - `queue:retry --all` / `queue:purge --all --queue` collect matching keys before deleting, so cursor pagination no longer skips jobs; `queue:failed --queue --limit` now counts matching jobs rather than scanned keys.
  - Documented that delivery is at-least-once with best-effort de-duplication (not exactly-once), since the processed marker is written only after a handler succeeds and KV is eventually consistent — handlers must be idempotent.

  Email (SMTP):

  - Upgrade STARTTLS onto the socket `startTls()` returns: the original socket is closed by the runtime, so the post-upgrade reader/writer are re-derived from the new secure socket and any pre-handshake bytes are discarded (fixes a broken `smtp://` STARTTLS path on real Workers and closes the STARTTLS plaintext-injection vector).
  - Refuse to send credentials over an unencrypted connection: an `smtp://` server that doesn't offer STARTTLS now fails loudly instead of leaking the password (blocks STARTTLS-stripping downgrades). Credential-free connections (e.g. local Mailpit) are unaffected.
  - AUTH is gated on the server's advertised mechanisms and supports both `PLAIN` and `LOGIN`; usernames are percent-decoded like passwords.
  - Add a response timeout so a hung SMTP server can't wedge the worker; QUIT/socket close are now best-effort and never mask a successful send.
  - MIME builder strips CR/LF from headers, escapes/RFC 2231-encodes attachment filenames (prevents header injection), base64-encodes message bodies (fixes long-line corruption), and rejects envelope addresses containing whitespace or angle brackets (prevents `MAIL FROM`/`RCPT TO` desync).

  Inertia SEO:

  - `titleTemplate` substitutes every `%s` and treats `$`-sequences in the title literally.
  - Inject head/body content via function replacements, so SEO/page content containing `$`-sequences (`$$`, `$&`, `` $` ``, `$'`) is no longer corrupted or able to splice a template placeholder back into the output.
  - Drop unsafe attribute names — including inline event handlers (`on*`) — from custom `meta`/`link` entries (prevents tag breakout server-side, `setAttribute` errors during client head-sync, and developer-supplied event-handler attributes).

  Feature flags:

  - `FeatureFlagService.use()` binds the target app exactly once.

  Database (framework):

  - The reentrant `$transaction` proxy forwards the receiver for non-transaction property access.

  Testing:

  - `TestingModule.close()` drops the isolated per-file database even if shutdown throws; the stale-database sweep escapes LIKE metacharacters so a prefix containing `_` can't over-match.

  DI:

  - Construct singletons against the root container so they can never capture a request-scoped dependency (which would leak one request's state across every later request); an illegal singleton→request dependency now throws loudly.
  - Detect circular dependencies and throw a clear error naming the cycle instead of overflowing the stack.
  - `tryResolve` only swallows "no provider"; a registered provider that throws while constructing now surfaces the real error instead of injecting `undefined`.
  - Request-cache invalidation tracks transitive constructor dependencies, so re-registering a value rebuilds cached services that depend on it through a transient intermediary.

  Quarry dev runtime:

  - Persist every durable plugin (KV, D1, R2, Durable Objects, cache) under `.wrangler/state/v3`, matching `wrangler dev` (previously only R2 was persisted); load `.env.local` / `.env.<env>.local` into `process.env` for full parity.
  - The `cloudflare:sockets` STARTTLS shim re-attaches the stream error handler to the upgraded socket, so post-upgrade connection errors still surface.

- 13b0e8d: Add backend-driven SEO metadata management with hreflang and automatic client-side head synchronization

  - Configure app-wide SEO defaults and a title template via `InertiaModule.forRoot({ seo: { ... } })`.
  - Set per-page metadata from controllers or middleware with `ctx.seo({ ... })` — title, description, Open Graph, Twitter card, canonical URL, and arbitrary meta/link tags.
  - Locale alternates (`rel="alternate" hreflang="…"`) are generated automatically for path-prefixed and querystring locale strategies and merged into the rendered tags.
  - Server-rendered SEO tags are kept in sync with the document head across SPA navigations automatically — no app wiring required.
  - New `useSeo()` React hook to read the resolved SEO data in components.
  - New `@stratal/inertia/seo` entry point exporting SEO types and tag-building utilities.
  - Fix: error responses for idempotent GET/HEAD navigations (e.g. deferred partial reloads) now render in place instead of using flash + redirect, preventing redirect loops.

- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [be813bc]
- Updated dependencies [be813bc]
  - @stratal/testing@0.0.23
  - stratal@0.0.23

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
