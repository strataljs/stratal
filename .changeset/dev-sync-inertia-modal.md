---
'@stratal/inertia-modal': patch
---

Render a modal route's background page client-only when that page is excluded from SSR.

- Render a modal route's background page client-only when it is excluded from SSR at build time through `stratalInertia({ ssrExclude })`. A direct visit or refresh of such a modal route previously failed with `Page not found` and a 500, because the combined page was always rendered through SSR instead of honouring the same exclusion as a full-page render. The excluded page now renders client-only for the browser bundle to hydrate, so a modal route works under both SSR and client-side rendering.
