# Inertia Modal

Backend-driven modal pages for Stratal Inertia. A modal route is a real route, so direct URL visits, refreshes, and back/forward navigation all work.

The server renders **one modal per response** and the browser holds the stack. Opening a sheet is one request that renders one component; the page beneath is rendered only for a direct visit or a refresh, which is the one case with nothing already on screen.

Requires `@stratal/inertia` already configured. Install:

```bash
npm install @stratal/inertia-modal
```

## Setup

Add `ModalModule` to the root module imports. It depends on `InertiaModule` (already in your imports) and registers an i18n message namespace.

```typescript
// src/app.module.ts
import { Module } from 'stratal/module'
import { InertiaModule } from '@stratal/inertia'
import { ModalModule } from '@stratal/inertia-modal'

@Module({
  imports: [
    InertiaModule.forRoot({ rootView }),
    ModalModule,
  ],
})
export class AppModule {}
```

## Render a Modal Route

Use `ctx.modal(component, props, { base })` in any controller. `base` is what sits *beneath* this level — a page route, or another modal route.

```typescript
// src/domain/parent/parent.controller.ts
import { Controller, Get } from 'stratal/router'
import { object, string } from 'zod/mini'

@Controller('/parent')
export class ParentController {
  @Get('/:id/edit', { params: object({ id: string() }) })
  async edit(ctx: RouterContext) {
    const item = await this.service.find(ctx.param('id'))
    return ctx.modal('Parent/Edit', { item }, { base: '/parent' })
  }
}
```

When the user clicks an in-app link to `/parent/42/edit`, the current page stays mounted and `Parent/Edit` is drawn over it. When the user direct-visits that URL, the framework follows `base` in-process until it reaches a route that is not a modal, and renders that as the page.

Write `base` as a route that always renders for anyone who can reach the modal route. It is the guaranteed background; a `base` that cannot be rendered is a `ModalBackgroundFetchError`.

## Frontend Setup

Pass `createInertiaApp`'s `resolve` through `withModals()` in **both** entries, and place `<Modal />` once in your layout. `withModals()` resolves every open level's component ahead of the render — a real `import()` cannot happen mid-render — so `setup` only hydrates.

```tsx
// src/inertia/app.tsx — client entry
import { createInertiaApp } from '@inertiajs/react'
import { hydrateRoot } from 'react-dom/client'
import { withModals } from '@stratal/inertia-modal/react'

const pages = import.meta.glob('./pages/**/*.tsx')

const resolve = async (name: string) => {
  const page = await pages[`./pages/${name}.tsx`]?.()
  if (!page) throw new Error(`Page not found: ${name}`)
  return page
}

createInertiaApp({
  resolve: withModals(resolve),
  setup: ({ el, App, props }) => hydrateRoot(el, <App {...props} />),
})
```

```tsx
// src/inertia/ssr.tsx — SSR entry
import { createInertiaSsrApp } from '@stratal/inertia/ssr'
import { withModals } from '@stratal/inertia-modal/react'

export const { render } = createInertiaSsrApp({
  resolve: withModals(resolve),
  setup: ({ App, props }) => <App {...props} />,
})
```

`withModals()` takes no options. It resolves every level the runtime has an entry for: `stratalInertia({ ssrExclude })` drops a page from the worker bundle, so on a server an excluded level is skipped, while a browser resolves each one — `<Modal />` draws nothing for a level whose component has not landed, and after a page has swapped that is an open sheet missing from the screen. `<Modal />` still keeps an excluded level out of the render that hydrates, which is the only one that has to match the server's HTML, and draws it on the next.

```tsx
// src/inertia/layouts/dashboard-layout.tsx
import { Modal } from '@stratal/inertia-modal/react'

export function DashboardLayout({ children }) {
  return (
    <>
      <Sidebar />
      <main>{children}</main>
      <Modal />
    </>
  )
}
```

Importing `@stratal/inertia-modal` or `@stratal/inertia-modal/react` augments Inertia's `PageProps`, so `usePage().props.modal` is typed `ModalData | undefined` — read it directly, never through a cast.

**A level rendered inside a portal cannot server-render.** `createPortal` is client-only, so a level whose content sits in a Radix `DialogPortal` / `SheetPortal` is absent from the server HTML however the entries are wired. Render the level outside a portal if its content must be in first paint.

## Open a Sheet

Use `<ModalLink>`. It carries the visit options that keep the page beneath mounted, in place, and un-refetched.

```tsx
import { ModalLink } from '@stratal/inertia-modal/react'

<ModalLink href={`/parent/${item.id}/edit`}>Edit</ModalLink>
<ModalLink href={`/parent/${item.id}/edit`} prefetch>Edit</ModalLink>
```

It takes every prop Inertia's `<Link>` takes, and anything you pass wins over what it sets.

## Stack Modals

A modal route nests by pointing its `base` at another modal route instead of a page. The route below stays an ordinary `ctx.modal()` call — nesting needs no special handling per level:

```typescript
@Get('/:id/edit', { params: object({ id: string() }) })
async edit(ctx: RouterContext) {
  const item = await this.service.find(ctx.param('id'))
  return ctx.modal('Parent/Edit', { item }, { base: '/parent' })
}

@Get('/:id/edit/history', { params: object({ id: string() }) })
async history(ctx: RouterContext) {
  const entries = await this.service.history(ctx.param('id'))
  return ctx.modal('Parent/History', { entries }, { base: `/parent/${ctx.param('id')}/edit` })
}
```

Opening `/parent/42/edit/history` while `/parent/42/edit` is showing stacks the history sheet above it; the edit sheet stays mounted underneath. `<Modal />` renders every open level, outermost first. A direct visit to a nested URL — a deep link, a shared link, a refresh — walks `base` to `base` and renders the whole chain above the page at the bottom, so a stacked modal route is as much a permalink as a single one.

- **A level's URL is its path and query string** — `/parent/42/edit?tab=history`, not `/parent/42/edit`. It is what identifies the level, so a response for that URL replaces the level rather than opening a second copy of it.
- **Nesting compares paths, not full URLs.** Write `base` query-free.
- **Nesting requires a matching `base`.** A modal route whose `base` does not name the level below it starts a fresh stack of its own.
- **A level keeps a stable identity while it stays open at the same URL.** Refreshing it, or opening another level above it, re-renders it in place, so uncontrolled inputs and `useForm` state inside the sheet survive.

## `useModal()` Hook

Inside a modal page component, call `useModal()` to read where this level sits and to act on it.

```tsx
// src/inertia/pages/Parent/Edit.tsx
import { useModal } from '@stratal/inertia-modal/react'

export default function EditItem({ item }: { item: Item }) {
  const { close } = useModal()

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <form method="put" action={`/parent/${item.id}`}>
        {/* ... */}
        <button type="button" onClick={close}>Cancel</button>
      </form>
    </Dialog>
  )
}
```

| Method/prop | Returns | Purpose |
|---|---|---|
| `modal` | `ModalData \| undefined` | This level. `undefined` outside a modal. |
| `depth` | `number` | How deep this level sits. The outermost level is `0`. |
| `isTop` | `boolean` | `true` for the level the reader is looking at. |
| `close(options?)` | `void` | Close this level and land where it was opened from. |
| `closeAll(options?)` | `void` | Close every open level and land where the outermost one was opened from. |
| `refresh(query?)` | `void` | Re-read this level under a refined query — a filter, a sort, a code the server prices. |
| `reload({ only })` | `void` | Fetch some of this level's props again, naming them the way the route does. |

Browser Back closes exactly one level at a time — the level that owns the current history entry pops, the ones below stay open.

`close()` lands on a URL, so the levels below it stay mounted and the page behind them keeps its props. Where it lands is fixed when the level opens — the page it was opened from, with its query — so a sheet opened from a filtered list closes back onto that list with its filters intact, refresh or no refresh.

Naming `only` makes that landing a partial visit, so the page keeps what it is already showing while the props you name refresh — a page whose reads are deferred lands on its content rather than falling back to its skeletons:

```tsx
close({ only: ['document', 'versions'] })
```

Name the page's props, not the level's: the landing is answered by the page, and the level is gone by the time it arrives.

Browser Back restores the page from the browser's history cache instead, which can hand it props older than the server has. If your page holds state that changes while it is open, re-read it on mount rather than trusting restored props.

### Re-reading the open level under a refined query

`refresh()` visits this level's own URL with the query you give it. The level is recognised by that URL, so a refinement never reads as a second sheet of the same route opening:

```tsx
const { refresh } = useModal()

refresh({ tab: 'history', page: 2 })
```

The address moves to the refined URL, so a reload returns to the same sheet.

## Prop Helpers in a Modal

`ctx.defer()`, `ctx.merge()`, `ctx.once()` and `ctx.scroll()` work on a modal route's props exactly as they do on a page's.

```typescript
@InertiaGet('/parent')
index(ctx: RouterContext) {
  return ctx.modal('Parent/Index', {
    items: ctx.scroll(() => this.db.$cursor.item.findMany({
      cursor: ctx.query('cursor'),
      take: 20,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    }), { matchOn: 'id' }),
  }, { base: '/' })
}
```

A level's props are nested under one page prop, so anything addressing a prop by name across the wire needs that path. Import `InfiniteScroll` and `Deferred` from `@stratal/inertia-modal/react` instead of `@inertiajs/react` and they apply the path for you — the same JSX then works in a sheet and on a page:

```tsx
import { Deferred, InfiniteScroll } from '@stratal/inertia-modal/react'

<InfiniteScroll data="items">
  {items.data.map((item) => <Row key={item.id} item={item} />)}
</InfiniteScroll>

<Deferred data="entries" fallback={<Skeleton />}>
  <Entries entries={entries} />
</Deferred>
```

For anything else naming a prop across the wire, use `reload()` — it names props the way the route does:

```tsx
const { reload } = useModal()

reload({ only: ['items'] })
```

## Gated Routes as a Background

A modal's `base` is rendered by a sub-request on a direct visit or refresh. A route that answers
clients with a redirect would refuse that render too, and the redirect is followed back to the modal,
which surfaces as `ModalBaseCycleError`. Let the background through:

```typescript
import { isModalBackground } from '@stratal/inertia-modal'

async handle(ctx: RouterContext, next: Next): Promise<void> {
  if (isModalBackground(ctx)) return next()
  // ...gate as usual
}
```

A client cannot make it answer true. A dispatcher that leaves the isolate answers false on the far
side, where the route gates as it would for a client.

## Replacing the Background Dispatcher

The page beneath a level is fetched through `MODAL_TOKENS.BackgroundDispatcher`. Provide your own to send that sub-request somewhere other than the app in process — a cached entrypoint, for instance:

```typescript
import { MODAL_TOKENS, type ModalBackgroundDispatcher } from '@stratal/inertia-modal'

@Module({
  providers: [
    { provide: MODAL_TOKENS.BackgroundDispatcher, useClass: MyDispatcher },
  ],
})
export class AppModule {}
```

A dispatcher takes `(request, ctx)` and returns the response. Every dispatcher's request carries the `Stratal-Modal-Document` header, so a route can tell it is being rendered as somebody's background.

## Testing

Activate the modal assertions on `TestResponse` in your test setup:

```typescript
// vitest.setup.ts
import '@stratal/inertia/testing'
import '@stratal/inertia-modal/testing'
```

A **document** request renders the whole chain, so it is what the chain assertions read:

```typescript
const response = await module.http.get('/parent/42/edit/history').send()

await response.assertInertiaComponent('Parent/Index')
await response.assertModalComponents(['Parent/Edit', 'Parent/History'])
await response.assertModalProp('entries.0.id', entry.id)
```

Depth 0 is the outermost level. Omit `depth` and the assertion addresses the level the response rendered.

| Method | Description |
|--------|-------------|
| `assertModal(callback?)` | Assert a modal is open. Optional callback receives the level the response rendered. |
| `assertNoModal()` | Assert no modal is open. |
| `assertModalComponent(component, depth?)` | Assert a level's component. |
| `assertModalComponents(components)` | Assert every open level's component, outermost first. |
| `assertModalBase(base, depth?)` | Assert what a level sits over. |
| `assertModalClose(close, depth?)` | Assert where closing a level lands. |
| `assertModalCount(count)` | Assert how many levels are open. |
| `assertModalDepth(depth)` | Assert the depth of the level the response rendered. |
| `assertModalProp(path, expected, depth?)` | Assert a level's prop at a dot-path. |
| `assertModalOnly()` | Assert the response carried the level alone, without the chain beneath it. |
| `modalLevel<TProps>(depth?)` | Read a level back. |
| `modalLevels<TProps>()` | Read every open level back, outermost first. |

Read a level back for anything the assertions do not cover — a predicate, a count, a parsed `base`:

```typescript
const level = await response.modalLevel<{ entries: HistoryEntry[] }>()
expect(level.props.entries).toHaveLength(1)
expect(new URL(level.base, 'https://app.test').pathname).toBe('/parent/42/edit')
```

An **Inertia visit** carries the level alone — the browser holds the rest:

```typescript
const response = await module.http
  .get('/parent/42/edit/history')
  .withHeader('X-Inertia', 'true')
  .send()

await response.assertModalOnly()
await response.assertModalComponent('Parent/History')
```

`assertModalCount()`, `assertModalComponents()`, `assertModalDepth()` and `modalLevels()` throw on such a response, because it genuinely does not say how many levels are open.

Name a level's prop path with `modalPropPath`, exported from `@stratal/inertia-modal/testing`:

```typescript
import { modalPropPath } from '@stratal/inertia-modal/testing'

const response = await module.http
  .get('/parent/42/edit/history?page=2')
  .withHeaders({
    'X-Inertia': 'true',
    'X-Inertia-Partial-Component': 'Parent/Index',
    'X-Inertia-Partial-Data': modalPropPath('entries'),
    'Referer': 'https://app.test/parent/42/edit/history',
  })
  .send()

await response.assertModalProp('entries.0.id', entry.id)
```

A narrowed answer is only given when the request came from the level itself, which the `Referer` reports — a partial re-issued into a modal route by a redirect gets the level whole.

### Component tests

The open stack, the page a level grafts onto, and the components resolved so far live outside the React tree, so
unmounting does not clear them and one test's open sheet becomes the next test's starting state. Reset them between
tests:

```typescript
import { resetModalState } from '@stratal/inertia-modal/react'

beforeEach(() => resetModalState())
```

## Errors

| Error | When | HTTP |
|---|---|---|
| `ModalBackgroundFetchError` | A route in the `base` chain returned a non-2xx response, an empty body, or a level of a shape this build cannot read. | 502 |
| `ModalBaseCycleError` | A `base` chain leads back to a route already in it. | 500 |

Catch in your global `ExceptionHandler` to render a friendly fallback. Imported from `@stratal/inertia-modal`.

Frontend wiring reports itself through these instead:

| Error | Cause | Fix |
|---|---|---|
| `no resolver registered` | `<Modal />` rendered without `resolve` having been passed through `withModals()`. | Wrap `resolve` with `withModals()` in both entries. |
| `could not resolve modal component "X"` | The component name matches no `./pages/<name>.tsx` key. | Check the component name the route renders. |

A level that renders without error but is absent from the server HTML is either listed in `ssrExclude` (client-only by design) or rendering inside a portal.

Their messages live under the `modal.*` namespace and read as English without any i18n setup of your own. To translate or override one, register your own messages for the same key; `modalMessages` names the English defaults.

## Sub-Path Imports

- `@stratal/inertia-modal` — `ModalModule`, `MODAL_TOKENS`, `ModalRenderOptions`, `ModalBackgroundDispatcher`, `ModalBackgroundFetchError`, `ModalBaseCycleError`, `modalMessages`, `ModalData`, `MODAL_PROP`, `MODAL_BENEATH_PROP`, `MODAL_MARKER_HEADER`, `MODAL_DOCUMENT_HEADER`
- `@stratal/inertia-modal/react` — `Modal`, `ModalLink`, `useModal`, `Deferred`, `InfiniteScroll`, `withModals`, `resetModalState`, `ModalLevel`, `ModalData`
- `@stratal/inertia-modal/testing` — side-effect import that adds the modal assertions to `TestResponse`; re-exports `ModalData` and `modalPropPath`
