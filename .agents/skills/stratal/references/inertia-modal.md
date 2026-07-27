# Inertia Modal

Backend-driven modal pages for Stratal Inertia. The server renders a modal page over a "background" page so that direct URL visits, refreshes, and back/forward navigation all work — the modal route is a real route, not client-only state.

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

Use `ctx.inertiaModal(component, props, { baseURL })` in any controller. `baseURL` is the page that should sit *behind* the modal when the user opens the modal URL directly (refresh, deep link, etc.).

```typescript
// src/domain/notes/notes.controller.ts
import { Controller, Get } from 'stratal/router'
import { object, string } from 'zod/mini'

@Controller('/notes')
export class NotesController {
  @Get('/:id/edit', { params: object({ id: string() }) })
  async edit(ctx: RouterContext) {
    const note = await this.service.find(ctx.param('id'))
    return ctx.inertiaModal('notes/Edit', { note }, { baseURL: '/notes' })
  }
}
```

When the user clicks an in-app link to `/notes/42/edit`, the current page stays mounted and `notes/Edit` overlays it. When the user direct-visits `/notes/42/edit`, the framework also renders `/notes` in-process so the modal still has a background.

## Frontend Setup

In `src/inertia/app.tsx`, register the page resolver with `resolver.set()` **before** `createInertiaApp` so the `<Modal>` component can dynamically load modal pages. Then place `<Modal />` once in your layout.

```tsx
// src/inertia/app.tsx
import { createInertiaApp } from '@inertiajs/react'
import { resolver } from '@stratal/inertia-modal/react'

const pages = import.meta.glob('./pages/**/*.tsx')

resolver.set(async (name) => {
  const page = await pages[`./pages/${name}.tsx`]?.()
  if (!page) throw new Error(`Page not found: ${name}`)
  return page
})

createInertiaApp({
  resolve: resolver.resolve,
  setup: ({ el, App, props }) => createRoot(el).render(<App {...props} />),
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

## `useModal()` Hook

Inside a modal page component, call `useModal()` to access modal state and close the modal.

```tsx
// src/inertia/pages/notes/Edit.tsx
import { useModal } from '@stratal/inertia-modal/react'

export default function EditNote({ note }: { note: Note }) {
  const { redirect } = useModal()

  return (
    <Dialog open onOpenChange={(open) => !open && redirect()}>
      <form method="put" action={`/notes/${note.id}`}>
        {/* ... */}
        <button type="button" onClick={redirect}>Cancel</button>
      </form>
    </Dialog>
  )
}
```

| Method/prop | Returns | Purpose |
|---|---|---|
| `show` | `boolean` | `true` when a modal is active on the current page. |
| `props` | `Record<string, unknown> \| undefined` | The modal component's props. |
| `redirect()` | `void` | Navigate back to the page that opened the modal (or `baseURL` on direct visits). |

## Partial Reloads

The modal prop is named `modal`. Trigger a refresh of just the modal (e.g. cascading select that re-queries server data) with Inertia's partial reload:

```tsx
import { router } from '@inertiajs/react'

router.reload({ only: ['modal'] })
```

The server short-circuits the background fetch in this case — only the modal sub-request runs.

## Errors

| Error | When | HTTP |
|---|---|---|
| `ModalBackgroundFetchError` | The background-page fetch returned a non-2xx response or empty body. | 502 |

Catch in your global `ExceptionHandler` to render a friendly fallback. Imported from `@stratal/inertia-modal`.

## Sub-Path Imports

- `@stratal/inertia-modal` — `ModalModule`, `MODAL_TOKENS`, `ModalData`, `ModalRenderOptions`, `ModalBackgroundFetchError`
- `@stratal/inertia-modal/react` — `Modal`, `useModal`, `resolver`
