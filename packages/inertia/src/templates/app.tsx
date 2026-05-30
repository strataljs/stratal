import { createInertiaApp } from '@inertiajs/react'
import { Seo } from '@stratal/inertia/react'
import { createRoot, hydrateRoot } from 'react-dom/client'

createInertiaApp({
  resolve: async (name) => {
    const pages = import.meta.glob('./pages/**/*.tsx')
    const page = await pages[`./pages/${name}.tsx`]?.()
    if (!page) throw new Error(`Page not found: ${name}`)
    return page
  },
  setup({ el, App, props }) {
    // <Seo/> keeps document.head in sync with the backend `seo` prop on every
    // navigation. It renders nothing, so hydration still matches the SSR output.
    const app = (
      <>
        <Seo />
        <App {...props} />
      </>
    )
    if (el.hasChildNodes()) {
      hydrateRoot(el, app)
    } else {
      createRoot(el).render(app)
    }
  },
})
