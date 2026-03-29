import { createInertiaApp } from '@inertiajs/react'

createInertiaApp({
  resolve: async (name) => {
    const pages = import.meta.glob('./pages/**/*.tsx')
    const page = await pages[`./pages/${name}.tsx`]?.()
    if (!page) throw new Error(`Page not found: ${name}`)
    return page
  },
})
