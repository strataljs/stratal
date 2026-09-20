---
"@stratal/inertia": patch
---

Fix `ReferenceError: require is not defined` 500 on every Inertia SSR page under the Cloudflare Workers
dev/SSR runtime.

`@stratal/inertia`'s SSR renderer imports the `react-dom/server` subpath. Because `@stratal/inertia` is
listed in the `stratalInertia()` plugin's `optimizeDepsExclude` (to avoid the Hono/stratal
duplicate-instance identity bug), Vite's optimizer never crawls into it and so never auto-discovers
`react-dom/server`. React 19's `react-dom/server` is a CJS shim whose conditional
`require('./cjs/react-dom-server.<env>.<mode>.js')` is only resolved by the optimizer's CJS→ESM
conversion — left undiscovered, that `require` reaches the workerd SSR runner (which has no `require`),
so every SSR page 500s. Force-optimizing the exact `react-dom/server` specifier makes esbuild perform the
CJS→ESM conversion; the framework's import then redirects to the converted copy.
