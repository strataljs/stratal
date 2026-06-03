---
"@stratal/inertia": patch
---

Stream server-side rendering with React 19 for faster TTFB and progressive Suspense rendering

The document shell (SEO + CSS) now flushes immediately while the app body streams, and `React.lazy`/`Suspense` boundaries stream in progressively instead of blocking the whole response. A new `createInertiaSsrApp` helper from `@stratal/inertia/ssr` wires this up for you. `quarry inertia:install` scaffolds an `src/inertia/ssr.tsx` using it.

`createInertiaSsrApp` is generic over your page props — call `createInertiaSsrApp<MyProps>({ … })` to type the resolver, or omit the type argument to keep the `import.meta.glob` resolver opaque (the default). A downstream cancellation (client disconnect) now propagates to the React render, and an invalid resolver result throws instead of rendering nothing.

Also fixes `ssr.disabled` glob matching, which previously compared against the full URL and so missed routes carrying a query string (e.g. `admin/*` vs `/admin/dashboard?tab=users`); it now matches the pathname only. Rerunning `quarry inertia:install` on an existing install now wires the SSR bundle into the current `InertiaModule.forRoot({ … })` instead of leaving SSR silently disabled.

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
