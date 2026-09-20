# @stratal/inertia-modal

Backend-driven modal pages for [Stratal](https://stratal.dev) Inertia apps. A modal route is a real route, so direct visits, refreshes and back/forward navigation all work.

[![npm version](https://img.shields.io/npm/v/@stratal/inertia-modal)](https://www.npmjs.com/package/@stratal/inertia-modal)
[![CI](https://github.com/strataljs/stratal/actions/workflows/ci.yml/badge.svg)](https://github.com/strataljs/stratal/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/strataljs/stratal/badge)](https://securityscorecards.dev/viewer/?uri=github.com/strataljs/stratal)
[![Known Vulnerabilities](https://snyk.io/test/github/strataljs/stratal/badge.svg)](https://snyk.io/test/github/strataljs/stratal)
[![npm downloads](https://img.shields.io/npm/dm/@stratal/inertia-modal)](https://www.npmjs.com/package/@stratal/inertia-modal)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/strataljs/stratal/pulls)
[![GitHub stars](https://img.shields.io/github/stars/strataljs/stratal?style=social)](https://github.com/strataljs/stratal)

## How it works

The server renders **one modal per response** and the browser holds the stack. Opening a sheet is one request that renders one component; the page beneath is rendered only for a direct visit or a refresh — the one case with nothing already on screen.

- **Permalinkable** — a modal URL can be shared, bookmarked and refreshed
- **Stackable** — a modal opened from inside another appears above it, with the one below still mounted
- **Headless** — `<Modal />` renders your components; bring your own dialog, sheet or drawer
- **Typed page props** — `usePage().props.modal` is typed, no cast
- **Test assertions** — `assertModalComponent()`, `assertModalProp()` and more

## Installation

Requires `@stratal/inertia` already configured.

```bash
npm install @stratal/inertia-modal
# or
yarn add @stratal/inertia-modal
```

## Setup

Add `ModalModule` to your root module. It needs no configuration and registers its own i18n messages.

```typescript
import { Module } from 'stratal/module'
import { InertiaModule } from '@stratal/inertia'
import { ModalModule } from '@stratal/inertia-modal'

@Module({
  imports: [
    InertiaModule.forRoot({ rootView: 'app' }),
    ModalModule,
  ],
})
export class AppModule {}
```

## Render a modal route

Use `ctx.modal(component, props, { base })` in any controller. `base` is what sits *beneath* this level — a page route, or another modal route.

```typescript
import { Controller, Get, type RouterContext } from 'stratal/router'
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

On an in-app visit to `/parent/42/edit` the current page stays mounted and `Parent/Edit` is drawn over it. On a direct visit, the framework follows `base` in-process until it reaches a route that is not a modal, and renders that as the page.

Write `base` as a route that always renders for anyone who can reach the modal route — it is the guaranteed background. A `base` that cannot be rendered raises `ModalBackgroundFetchError`.

## Frontend setup

Pass `createInertiaApp`'s `resolve` through `withModals()` in **both** entries, and place `<Modal />` once in your layout. `withModals()` resolves every open level's component ahead of the render, so `setup` only hydrates.

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
})
```

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

> A level rendered inside a portal cannot server-render. `createPortal` is client-only, so a level whose content sits in a Radix `DialogPortal` / `SheetPortal` is absent from the server HTML however the entries are wired. Render it outside a portal if its content must be in first paint.

## Open a sheet

`<ModalLink>` carries the visit options that keep the page beneath mounted, in place, and un-refetched.

```tsx
import { ModalLink } from '@stratal/inertia-modal/react'

<ModalLink href={`/parent/${item.id}/edit`}>Edit</ModalLink>
<ModalLink href={`/parent/${item.id}/edit`} prefetch>Edit</ModalLink>
```

## Inside a modal

`useModal()` gives the current level and the ways to act on it:

```tsx
import { useModal } from '@stratal/inertia-modal/react'

function EditSheet() {
  const { modal, depth, isTop, close, closeAll, refresh, reload, visit } = useModal()

  return (
    <Dialog open onOpenChange={(open) => { if (!open) close() }}>
      <button onClick={() => refresh({ sort: 'name' })}>Sort by name</button>
      <button onClick={() => reload({ only: ['items'] })}>Refresh items</button>
      <button onClick={() => visit(`/parent/${modal.props.item.id}/delete`)}>Delete</button>
    </Dialog>
  )
}
```

| Member | Description |
|---|---|
| `modal` | This level's data, or `undefined` outside a modal |
| `depth` | How deep this level sits; the outermost is `0` |
| `isTop` | Whether this is the level the reader is looking at |
| `close()` | Close this level and land where it was opened from |
| `closeAll()` | Close every open level |
| `refresh(query?)` | Re-read this level under a refined query |
| `reload(options?)` | Fetch some of this level's props again, named in the level's own terms |
| `visit(href, options?)` | Open a modal route from code |

Closing is always an explicit visit, never `history.back()` — a cached history entry would rewind the whole page, not just the modal.

## Deferred and infinite-scroll props

A level's props are nested under one page prop, so Inertia's own `<Deferred>` and `<InfiniteScroll>` cannot address them by name. Import these instead and the same JSX works inside a sheet and on a page:

```tsx
import { Deferred, InfiniteScroll } from '@stratal/inertia-modal/react'

<Deferred data="stats" fallback={<Spinner />}>
  <Stats />
</Deferred>

<InfiniteScroll data="items">
  {items.data.map((item) => <Row key={item.id} item={item} />)}
</InfiniteScroll>
```

## Testing

```typescript
// vitest.setup.ts
import '@stratal/inertia-modal/testing'  // augments TestResponse with modal assertions
import { resetModalState } from '@stratal/inertia-modal/react'

afterEach(() => resetModalState())
```

```typescript
const response = await module.http.get('/parent/42/edit').send()

await response.assertModalComponent('Parent/Edit')
await response.assertModalBase('/parent')
await response.assertModalProp('item.id', '42')
await response.assertModalCount(1)
```

Available assertions: `assertModal`, `assertNoModal`, `assertModalComponent`, `assertModalComponents`, `assertModalBase`, `assertModalClose`, `assertModalCount`, `assertModalDepth`, `assertModalProp`, `assertModalOnly`.

`resetModalState()` clears the three stores that deliberately outlive a render — the open stack, the page a level grafts onto, and the resolved components. Call it between tests.

## Documentation

Full guides and examples are available at **[stratal.dev](https://stratal.dev)**.

## Support the project

If Stratal is useful to you, **[star the repository](https://github.com/strataljs/stratal)** — it is the simplest way to help others find it.

## Maintainer

Built and maintained by **Temitayo Fadojutimi** — [@adesege_](https://x.com/adesege_).

## License

MIT
