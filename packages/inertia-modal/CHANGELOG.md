# @stratal/inertia-modal

## 0.1.0

### Minor Changes

- a753e55: Stack modal routes above one another with the stack held by the browser, server-render modal levels, and make the prop helpers work inside `ctx.modal()`.

  ### Nested stacks
  - A level nests when its `base` names the modal route below it; otherwise it starts a fresh stack. Each level owns its URL — path and query string — so a direct visit or refresh renders the whole chain, and closing a level lands where it was opened from, with the query it was opened under.
  - A level keeps a stable identity while it stays open at the same URL, so a refresh, or a level opening above it, does not remount it and lose in-progress form state.
  - Opening a sheet is one request that renders one component. The page behind it is rendered only for a direct visit or a refresh — the one case with nothing already on screen — so a sheet reached by a redirect no longer costs a second render of the page beneath it.
  - `<ModalLink>` opens a sheet and carries the visit options that keep the page behind it in place.
  - `useModal()` gives you `modal`, `depth`, `isTop`, `close()`, `closeAll()`, `refresh()`, `reload()` and `visit()`, and browser Back closes exactly one level. `refresh()` takes `router.get`'s options, `reload()` takes `router.reload`'s, and `close()`/`closeAll()` take `router.visit`'s, so a caller can time the visit it started rather than the next one to finish. All are properties holding closures, so destructuring one is safe.
  - `refresh(query)` re-reads the open level under a refined query — applying a filter, a sort, or a code the server prices. The level is recognised by its own URL, so a refinement never reads as a second sheet of the same route opening.
  - `isModalBackground(ctx)` tells a route it is being rendered as the page beneath a modal, so a route that answers clients with a redirect can render instead. Without it that redirect is followed back to the modal and surfaces as `ModalBaseCycleError`, which is added here and thrown when a `base` chain leads back to a route already in it. A client cannot make `isModalBackground` answer true.

  ### Closing a level
  - Closing lands on the page or the level the sheet was opened from, which stays mounted — so regions that were showing content keep showing it instead of falling back to a placeholder, and the page keeps the props it holds. That landing costs one request.
  - Where a level closes to is decided once, when it opens, and travels with the level, so a refresh of the sheet no longer loses the query the list beneath was filtered by. A level lands on the page, never on another level that is still open: a visit made from a sheet sends that sheet as its `Referer`, so the two could previously aim at each other and no amount of closing ever reached the page.
  - Closing repeatedly unwinds the whole stack rather than reopening the level that just closed, and dismissing a whole stack lands the same way as closing the outermost level.
  - The first browser Back after closing lands where the close already landed, so it appears to do nothing.
  - Rows a level had already loaded survive a close instead of restarting from the first page, and the level below is handed back under the identity it already had — so its scroll metadata and merge target stay at the path its mounted components read.

  ### Prop helpers, scroll and SSR
  - `defer`, `merge`, `once` and `scroll` now work inside `ctx.modal()`. A level was previously built from the raw argument and never run through prop resolution, so none of them had any effect; all four now behave in a sheet exactly as they do on a page.

    ```typescript
    return ctx.modal(
      "Parent/Index",
      {
        items: ctx.scroll(
          () =>
            db.$cursor.item.findMany({
              cursor,
              take: 20,
              orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            }),
          { matchOn: "id" },
        ),
      },
      { base: "/parent" },
    );
    ```

  - `<Deferred>` and `<InfiniteScroll>` re-exported from `@stratal/inertia-modal/react` resolve `data` against the modal they render in, so the same JSX works in a sheet and on a page and no caller composes the wire path itself.
  - A partial reload that names nothing about the level leaves it alone, so the client keeps what it holds and the level's outstanding `defer()` props are not advertised a second time — re-announcing them made the client fetch each one again for every reload the surrounding page made. A partial reload naming a level's props resolves just those.
  - **Modal levels now server-render.** `<Modal />` previously initialised its stack as empty state and filled it in two effects, so no level ever appeared in server-rendered HTML; levels now resolve before the tree renders and reach first paint. The open stack is also held outside the page component, so a background-page remount no longer destroys every open sheet.
  - Pass `createInertiaApp`'s `resolve` through `withModals()` in both the client and SSR entries. There is no bootstrap step to run before hydrating and no provider to wrap the tree in.

    ```tsx
    createInertiaApp({
      resolve: withModals((name) => pages[`./pages/${name}.tsx`]()),
      setup: ({ el, App, props }) => hydrateRoot(el, <App {...props} />),
    });
    ```

  - This makes first-paint modal content _possible_; it does not make every modal's markup appear. A level whose content renders inside a Radix `Portal` still will not appear in server HTML, since `createPortal` is an inherently client-side DOM operation. If you want a level's content in first paint, that level has to render without a Portal.
  - Render a modal route's background page client-only when that page is excluded from SSR through `ssrExclude`. A direct visit or refresh of such a modal route previously failed with `Page not found` and a 500.
  - Keep a sheet on screen while the level replacing it loads, rather than leaving the screen with no sheet for as long as the component takes to arrive.

  ### Testing

  Import `@stratal/inertia-modal/testing` alongside `@stratal/inertia/testing`. Eight assertions, chainable like the Inertia family, plus two readers:

  ```typescript
  await response.assertModalComponents(["Parent/Index", "Parent/Edit"]);
  await response.assertModalProp("item.id", "42");

  const level = await response.modalLevel<{ items: Item[] }>();
  expect(level.props.items).toHaveLength(1);
  ```

  - `assertModal(callback?)` / `assertNoModal()`, `assertModalComponent(component, depth?)`, `assertModalComponents(components)`, `assertModalCount(count)`, `assertModalDepth(depth)`, `assertModalProp(path, expected, depth?)`, `assertModalOnly()`, plus `modalLevel<TProps>(depth?)` and `modalLevels<TProps>()`.
  - `assertModalBase()` and `assertModalClose()` assert what a level sits over and where closing it lands — a wrong close target is otherwise invisible until someone taps Close and does not arrive.
  - Not one of them names a payload field, so a later payload change costs you nothing. Only a direct visit or a refresh reports what sits beneath, so the whole-stack assertions fail on any other response rather than reporting `1`.
  - `resetModalState()` empties everything the package holds outside the React tree, so a test runner sharing the module across tests does not carry one test's open sheet into the next.
  - `modalPropPath(prop)` is exported for a test naming a level's prop path.

  ### Fixes
  - `ctx.seo()` on a modal route now reaches the page. A level's metadata is written to the prop the client head-sync reads and injected into the document head on a direct visit, so the sheet's own title and description apply while its URL is the address. It was previously discarded outright, and a direct visit rendered no SEO tags at all. A level that never calls `ctx.seo()` leaves the background page's metadata untouched.
  - A modal route answers with the flash the request carries, instead of an empty one. A submission that flashed its result and redirected into a sheet — a purchase outcome, a confirmation — previously lost it outright.
  - Fix `<InfiniteScroll>` inside a level requesting the same page over and over without adding rows, and silently stopping after a sheet opened over it is closed. A scroll fetch is now recognised as the level it came from asking for the next page of its own prop, and a scrolled level keeps the URL it was opened under so neither the close target nor a later refresh drifts a page at a time.
  - Leaving a level that holds an `<InfiniteScroll>` no longer throws about a missing scroll prop. The subscription now ends with the level, however the level was left — closing it, the back button, a link elsewhere — and a level still open keeps the rows it had loaded.
  - A level is recognised under either spelling of its path, so an app appending a trailing slash no longer draws a second copy of a sheet it already has open.
  - Leave an open level alone when a response is not addressed to it. A partial reload for a prop of the page _beneath_ a modal — a poller, a `defer()` prop of that page — was answered with the level attached and carrying no props, and the client seated that empty level back on the chain, so the sheet lost every prop it held and a level reading one as it renders went blank with an uncaught `TypeError`.
  - Errors this package raises — a failed background fetch, a `base` chain that cycles — now read as English sentences rather than raw message keys. The `modal.*` keys are exported, so an app running i18n can translate or override any of them. A `base` answering `2xx` with a body that is not a page reports a 502 carrying the parse failure as its `cause`.
  - Keep server-only code out of the `@stratal/inertia-modal/react` entry, so pages hydrate in development. The entry reached request handling that runs on `node:async_hooks`; a production build dropped it as unused, but a development build shipped it to the browser where it cannot resolve, so no page rendering `Modal` hydrated.
  - Keep the render of the page beneath a modal inside the isolate that issued it, rather than forwarding it to a response-cache gateway where the background marker means nothing — which refused a base page that answers with a redirect, and could store that render under the visitor's own cache key.

  ### Breaking Changes
  - **`ctx.inertiaModal(component, props, { baseURL })` is replaced by `ctx.modal(component, props, { base })`.** Rename the call and the option at every call site, including modal routes whose background is another modal route — there is no separate call for those.
  - **`MODAL_VISIT` and `MODAL_REFRESH` are removed.** Replace `<Link {...MODAL_VISIT}>` with `<ModalLink>`, and a `MODAL_REFRESH` visit with `refresh()` from `useModal()`.
  - **`useModal().redirect()` is renamed to `close()`.** Update `const { redirect } = useModal()` to `const { close } = useModal()`, and any `onClick={redirect}` to `onClick={close}`.
  - **`useModal()` no longer returns `show` or `props`.** Read `modal` instead: it is `undefined` outside a modal, and carries the level's `props`.
  - **`useModalPropPath` is removed.** A level's props sit at a fixed path, so `reload({ only: ['items'] })` from `useModal()` names them by bare name.
  - **`prepareModalComponents`, `rememberModalComponents`, `clearModalComponents` and `ModalComponentsContext` are removed.** Pass `resolve` through `withModals()` instead. A test suite that called `clearModalComponents` between tests wants `resetModalState()`.
  - **`modalPropPath` moves to `@stratal/inertia-modal/testing`** and takes only a prop name.
  - **`ModalNestingLimitError`, `ModalPayloadMismatchError` and `ModalRequestHeaderError` are removed**, along with every modal request header. Nothing about the stack travels to the server any more.
  - **A response carries one modal, at `page.props.modal`**, addressed at `modal.props.<name>` with no key in the path; the keyed and positional containers are both gone, and `ModalData.nativeBack` with them. No runtime code outside the package reads the payload, so this affects only tests asserting on it directly — move those onto the assertions above rather than onto the new field names:

    ```diff
    -expect(body.props.modal.stack[0].component).toBe('Parent/Edit')
    -expect(body.props.modal.stack[0].props.item.id).toBe(target.id)
    +await response.assertModalComponents(['Parent/Edit'])
    +await response.assertModalProp('item.id', target.id)
    ```

  - **Modal levels now server-render**, where they were previously always drawn in after hydration. A consumer relying on client-only mounting inside a level — a `useLayoutEffect` that assumed it would never run on the server, say — should read this as a behaviour change, not a fix.

### Patch Changes

- Updated dependencies [a753e55]
- Updated dependencies [a753e55]
- Updated dependencies [a753e55]
  - stratal@0.1.0
  - @stratal/inertia@0.1.0
  - @stratal/testing@0.1.0

## 0.0.27

### Patch Changes

- Updated dependencies [41a9140]
  - stratal@0.0.27
  - @stratal/inertia@0.0.27

## 0.0.26

### Patch Changes

- Updated dependencies [ab95f52]
- Updated dependencies [ab95f52]
- Updated dependencies [bb6d3b9]
  - stratal@0.0.26
  - @stratal/inertia@0.0.26

## 0.0.25

### Patch Changes

- Updated dependencies [e93db60]
- Updated dependencies [e93db60]
  - stratal@0.0.25
  - @stratal/inertia@0.0.25

## 0.0.24

### Patch Changes

- Updated dependencies [10cf223]
  - @stratal/inertia@0.0.24
  - stratal@0.0.24

## 0.0.23

### Patch Changes

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
  - stratal@0.0.23
  - @stratal/inertia@0.0.23

## 0.0.22

### Patch Changes

- 4b273ea: Add `nativeBack` support to modal navigation and eagerly resolve deferred props in background page fetches
  - `useModal().redirect()` now uses `history.back()` instead of a server round-trip when the modal was loaded via a partial reload, providing instant close behavior.
  - Background page fetches send `x-inertia-resolve-deferred: true` to ensure deferred props are included in the response.

- 1658945: Fix modal component re-rendering by tracking component path instead of nonce
- Updated dependencies [1658945]
- Updated dependencies [1658945]
- Updated dependencies [4b273ea]
- Updated dependencies [4b273ea]
  - @stratal/inertia@0.0.22
  - stratal@0.0.22

## 0.0.21

### Patch Changes

- 3489cfd: Preserve query string and forwarded headers on modal background requests
  - The background page request now keeps the referer URL's query string, so opening a modal no longer resets the parent list view's filter/pagination state to defaults.
  - `x-forwarded-proto`, `x-forwarded-host`, `x-forwarded-for`, `x-forwarded-port`, `x-real-ip`, `accept-language`, and `user-agent` are forwarded from the original request when present. Middleware that reconstructs the canonical request URL (e.g. apps whose `appUrl` is derived from forwarded headers) now sees the same protocol/host as the original request, fixing background fetches that previously appeared unauthenticated because Better Auth's secure-cookie prefix was resolved against the wrong base URL.

- Updated dependencies [3489cfd]
- Updated dependencies [3489cfd]
- Updated dependencies [3489cfd]
- Updated dependencies [3489cfd]
  - stratal@0.0.21
  - @stratal/inertia@0.0.21

## 0.0.20

### Patch Changes

- f8c61e1: Loosen peer dependency ranges for broader compatibility

  Peer dependencies (`@inertiajs/core`, `@inertiajs/react`, `hono`, `react`, `reflect-metadata`, `stratal`) now use `>=` ranges instead of pinned `^` ranges, so apps can adopt newer majors of these packages without waiting for a coordinated bump.

- Updated dependencies [f8c61e1]
- Updated dependencies [f8c61e1]
- Updated dependencies [f8c61e1]
- Updated dependencies [f8c61e1]
- Updated dependencies [f8c61e1]
- Updated dependencies [f8c61e1]
- Updated dependencies [f8c61e1]
- Updated dependencies [f8c61e1]
- Updated dependencies [f8c61e1]
  - stratal@0.0.20
  - @stratal/inertia@0.0.20

## 0.0.19

### Patch Changes

- 5d26c24: Rearchitect i18n module augmentation to a per-module keyed registry (breaking change)

  **Why:** Multiple modules augmenting `AppMessages` with a shared top-level parent (e.g., `errors.auth`, `errors.uploads`, `errors.branding`) collided with TypeScript error **TS2717** ("Subsequent property declarations must have the same type"). Interface merging adds new properties across declarations but requires same-named properties to have structurally identical types — it does not deep-merge nested shapes.

  **What changed:**
  - Replaced the single augmentable `AppMessages` interface with an `AppMessageNamespaces` keyed registry. Each module declares its own distinct top-level key (Laravel-style package namespacing). Because each declaration adds a different property, interface merging accepts them all.
  - `AppMessages` is now derived: `{ [K in keyof AppMessageNamespaces]: AppMessageNamespaces[K] }`.
  - Access keys are unchanged dot-notation — `i18n.t('auth.errors.invalidCredentials')` — so no custom resolver is needed.

  **Migration:**

  Before:

  ```ts
  declare module "stratal/i18n" {
    interface AppMessages {
      errors: { uploads: { notFound: string } };
    }
  }
  ```

  After:

  ```ts
  declare module "stratal/i18n" {
    interface AppMessageNamespaces {
      uploads: { errors: { notFound: string } };
    }
  }
  ```

  **Framework package moves:**
  - All `errors.auth.*` keys (previously split between `stratal` core and `@stratal/framework`) now live in the auth module as `auth.errors.*`. `errors.auth.org.*` → `auth.org.*`. The `errors.auth.*` namespace has been removed from `stratal`'s core messages.
  - `@stratal/framework`'s `DatabaseModule` now registers its `database.*` validation messages via `I18nModule.registerMessages` (previously the messages file existed but was never wired up).
  - `@stratal/inertia-modal`'s `errors.modal.*` key moved to `modal.errors.*`.

  **Callsite updates required in downstream apps:**

  ```ts
  // Before
  new ApplicationError('errors.auth.invalidCredentials', ...)
  i18n.t('errors.auth.org.organizationNotFound')

  // After
  new ApplicationError('auth.errors.invalidCredentials', ...)
  i18n.t('auth.org.organizationNotFound')
  ```

  No runtime API change: `I18nModule.registerMessages(messages)` keeps its existing signature, and deep-merge behavior is unchanged. Locale-only contributions that override core's built-in `errors.*` / `common.*` / etc. continue to work.

- Updated dependencies [3b16f5b]
- Updated dependencies [5d26c24]
- Updated dependencies [5d26c24]
- Updated dependencies [3b16f5b]
- Updated dependencies [3b16f5b]
- Updated dependencies [5d26c24]
- Updated dependencies [5d26c24]
- Updated dependencies [3b16f5b]
  - stratal@0.0.19
  - @stratal/inertia@0.0.19
