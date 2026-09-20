---
"@stratal/inertia": minor
---

Add build-time SSR exclusion, client-side access control and `ctx.scroll()` for infinite scroll, and make Inertia pages cacheable.

### Build-time SSR exclusion

- Add `ssrExclude` to the `stratalInertia()` Vite plugin. Client-only pages and their heavy dependencies were previously always bundled into the worker, because the SSR page glob pulled in every page; disabling SSR at runtime skipped rendering but still shipped the code.

  ```typescript
  stratalInertia({ ssrExclude: ['Admin/**', 'Reports/Heavy'] })
  ```

  Patterns are matched against the page name, where `*` is a single segment and `**` any number. Excluded pages are dropped from the worker bundle and rendered client-only, while the browser bundle still includes them so they hydrate normally.
- Apply `ssrExclude` to an array-form page glob such as `import.meta.glob(['./pages/**/*.tsx', '!...'])`, keeping the negative patterns it already had. Only the single-string form worked before, so an array-form resolver silently kept every page in the worker bundle. A glob that cannot be rewritten now emits a build warning naming the file.
- Rewrite `import.meta.glob` resolvers that pass a second argument, such as `{ eager: true }`, preserving those options.

### Client-side access control

- Add the `<Can>`, `<Cannot>`, `<HasRole>` and `<HasNoRole>` components plus the `useCan`, `useRole` and `useAccess` hooks, on a new `@stratal/inertia/react/access` entry. They are gated on permissions the server shares automatically once `accessControl` is configured, and permission strings and role names are type-checked against a generated registry.

### Infinite scroll

Add **`ctx.scroll(callback, options?)`** for Inertia v3 infinite scroll, which makes `@inertiajs/react`'s `<InfiniteScroll>` work against a Stratal route. Until now the page carried no scroll metadata at all and the component threw before rendering.

```typescript
return ctx.inertia('notes/Index', {
  notes: ctx.scroll(() => this.service.paginate(page), { matchOn: 'id' }),
})
```

- The identifiers are derived; there is nothing to restate. Two shapes are recognised directly: the offset shape of `paginatedResponseSchema`, and `@stratal/framework`'s `db.$cursor` result. Any other shape throws `UnrecognizedScrollShapeError` rather than guessing, because a wrong next page reads to the client as "no more pages" and silently truncates the list. Pass `metadata` to name the identifiers for a third-party shape.
- The prop value keeps its paginator shape and only the rows under `wrapper` (default `data`) accumulate. Options are `wrapper`, `matchOn`, `pageName` and `metadata`.
- **`matchOn` has never deduplicated anything.** Entries were emitted in a form the client resolved to no prop, so every merge fell back to plain concatenation. A row that changes between two pages of a merged list is now collapsed instead of appearing twice.
- **`X-Inertia-Reset` is now honoured.** The header was parsed and discarded, so a prop the client named in it was joined to rather than replaced.
- Adds the `assertInertiaScrollProp(prop, expected?)` assertion and exports `UnrecognizedScrollShapeError` alongside the scroll option and metadata types.

### Caching

- Cache partial reloads, and with them every `ctx.defer()` prop, by declaring the Inertia protocol headers in `Vary` on every response. Deferred props are delivered by a follow-up partial reload, and those were refused outright, so a page that defers its expensive work kept all of that work uncached and caching bought close to nothing. Adds the `INERTIA_VARY_HEADERS` export naming the set. **`Vary` now lists these names on every Inertia response**, where it previously listed only `X-Inertia`, so anything asserting on that exact header value needs updating.
- Skip caching for pages that cannot be shared between callers: a page carrying flash data or a `once()` prop is not cached. On a cache hit the SSR render is skipped entirely, so a cached page costs no render.
- Narrow into a nested prop on a partial reload instead of answering with the whole of its parent. `only: ['auth.user']` asks for one field of `auth`; sending all of `auth` is the payload the partial reload was made to avoid. Prop metadata now names every entry by its full path, so a `defer()` nested under another prop is advertised where the client will look for it.

### Server rendering and dev runtime

- Add a **`prepare(page)`** hook to `createInertiaSsrApp`, which runs once per `render(page)` call and hands its result to `setup` as `prepared`. It exists so a request-scoped value can reach the tree without a module-level variable — a Workers isolate serves many requests concurrently, so module-level "current request" state is a cross-request leak. Omit it and `prepared` is `undefined`, which the type now enforces.
- Recycle the dev worker when its memory reaches a threshold, fixing frequent dev-server crashes in large apps. Under sustained HMR the dev isolate's heap grows until it hits the V8 limit and the worker aborts, which the browser shows as "Fetch failed". `quarry inertia:dev` now keeps the dev server alive, with a default threshold of 900 MB configurable through `--heap-limit=<MB>`. Supervision runs on macOS and Linux; elsewhere it is disabled with a warning.
- Strip react-dom's unused legacy synchronous server renderer from the worker SSR bundle, dropping around 197 KB raw from a minimal app. SSR is streaming-only, so `renderToString` and `renderToStaticMarkup` are not available in the worker.
- Fix every SSR page returning a 500 with `ReferenceError: require is not defined` or `module is not defined` under the Workers dev and SSR runtime. React 19's server entry, `react-dom/client`, the ORM data layer and the email renderer all reach CommonJS through packages excluded from Vite's optimizer, so their conditional `require` reached the worker runtime unconverted. An app that happened to import `react-dom` elsewhere was unaffected, while a minimal app failed on every request.
- Fix a guest SSR render failing at app init with `createPoolFactory is not a function` under a linked or portal checkout.
- Export `DocumentRendererService`, which renders a built `Page` into an HTML document and owns the single decision between streaming SSR and a client-only shell. `InertiaService` and `@stratal/inertia-modal` both delegate to it, so anything rendering an Inertia document outside those paths should inject the token rather than duplicate the branch.

### Fixes

- Answer a version mismatch with a real 409 instead of a 500. The mismatch branch set a status and headers but returned no response, so configuring `version` turned every stale client into a server error rather than the reload the check exists to trigger.
- Send the current asset version on that response, so the client can tell "this client is out of date" apart from an ordinary external redirect. The cancelable `location` event now reports `versionChange: true`, and async visits are left alone instead of reloading the page underneath a background request; both were previously unreachable.
- Reconcile the client head on a visit that only changed the props of the component already on screen. Closing a modal is exactly that shape, so the head previously kept the level's title while the address had moved back to the page's.
- Type the shared page props of an app that registers Inertia from a config namespace. `inertia:types` read `sharedData` and `accessControl` out of `src/app.module.ts` alone, and only as a literal, so an app composing its modules elsewhere or passing `config.asProvider()` had every shared prop reach pages as `{}` and access control never resolve. Both are now read wherever the registration lives, and a provider argument is followed back to the factory it came from.
- Pick up `ctx.modal()` calls in the type generator the same way as `ctx.inertia()`. If you hand-wrote prop types for a modal page, remove them and let the generated type be the only source.
- Fix two type-generator bugs that gave page props the wrong types: `ctx.share()` calls were not detected at all, and shared props wrapped in `always()`, `defer()`, `optional()`, `merge()` or `once()` were typed as the wrapper instead of the value it resolves to.
- Stop inlining the full i18n message-key union into page-prop types, which can shrink generated declaration files by an order of magnitude on apps with large key sets. Nullable and optional key unions no longer defeat detection, and props covering the full key set reference `MessageKeys` from `stratal/i18n`.
- Add `SeoService.contributed()`, which reports whether anything has called `ctx.seo()` on this request — what a caller rendering one page over another needs in order to keep the underlying page's metadata instead of overwriting it with the defaults.
- Add `InertiaService.resolveProps()` and `partialRequestFor()`, so a caller assembling its own page can resolve props with the same semantics `render()` applies.

### Breaking Changes

- **`ssr.disabled` is removed** from `InertiaModule.forRoot({ ssr })`. Replace it with the Vite plugin's `ssrExclude`, which both skips SSR and drops the excluded pages from the worker bundle: `stratalInertia({ ssrExclude: ['Admin/**'] })`.
- **`ctx.withoutSsr()` and the `withoutSsr` context variable are removed.** SSR exclusion is now build-time and declarative, so there is no per-request runtime opt-out.
- **`Vary` now lists every Inertia protocol header on every response**, not just `X-Inertia`. Update anything asserting on that exact value.
- **The validation API is `zod/mini`.** The `z` re-export is gone from the validation surface this package re-exports. Import schema builders directly from `zod/mini` using named imports and replace classic chaining with the functional API: `z.string().min(1).optional()` becomes `optional(string().check(minLength(1)))`.
- **OpenAPI documents are generated lazily**, on the first request to the docs endpoint. `OpenAPIService.getSpec()` becomes `getSpec(container)` and is async, and `routeFilter` is now a metadata predicate `(route: RouteSchemaMeta) => boolean` instead of `(path, pathItem)`.
