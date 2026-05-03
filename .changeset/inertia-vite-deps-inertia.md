---
"@stratal/inertia": patch
---

Exclude `hono`, `stratal`, and Hono OpenAPI plugins from Vite pre-bundling

`stratalInertia()` now adds `stratal`, `hono`, `@hono/zod-openapi`, and `@hono/swagger-ui` to `optimizeDeps.exclude`. Pre-bundling those packages produced duplicate copies in `.vite/deps_<env>/`, so Response objects from one instance flowed into a Hono Context from the other and crashed inside the `set res` setter (`this.#res.headers.entries is not a function`). Excluding them keeps a single shared instance.
