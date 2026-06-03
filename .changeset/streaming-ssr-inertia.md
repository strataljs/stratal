---
"@stratal/inertia": patch
---

Stream server-side rendering with React 19 for faster TTFB and progressive Suspense rendering

The document shell (SEO + CSS) now flushes immediately while the app body streams, and `React.lazy`/`Suspense` boundaries stream in progressively instead of blocking the whole response. A new `createInertiaSsrApp` helper from `@stratal/inertia/ssr` wires this up for you. `quarry inertia:install` scaffolds an `src/inertia/ssr.tsx` using it.

### Breaking Changes

- The SSR bundle now returns a stream, and there is no longer a silent client-side fallback — if SSR fails to load or render, the error surfaces (500) instead of degrading silently.
- Migrate your `src/inertia/ssr.tsx` to use the new helper:

  ```tsx
  import { createInertiaSsrApp } from '@stratal/inertia/ssr'

  export const { render } = createInertiaSsrApp({
    resolve: async (name) => {
      const pages = import.meta.glob('./pages/**/*.tsx')
      const page = await pages[`./pages/${name}.tsx`]?.()
      if (!page) throw new Error(`Page not found: ${name}`)
      return page
    },
  })
  ```

  Replace the previous `createInertiaApp` + `renderToString` setup, which returned `{ head, body }`. App-level providers go in the optional `setup` callback. Document metadata should come from server-side `ctx.seo()` — a `<Head>` inside a suspended boundary is not captured during streaming.
