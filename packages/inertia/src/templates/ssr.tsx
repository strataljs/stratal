import { createInertiaApp } from '@inertiajs/react'
import { renderToString } from 'react-dom/server'

const pages = import.meta.glob('./pages/**/*.tsx', { eager: true }) as Record<string, { default: React.ComponentType }>

export async function render(page: unknown) {
  return createInertiaApp({
    page,
    render: renderToString,
    resolve: (name) => {
      const mod = pages[`./pages/${name}.tsx`]
      if (!mod) {
        throw new Error(`Page not found: ${name}`)
      }
      return mod
    },
    setup: ({ App, props }) => <App {...props} />,
  })
}
