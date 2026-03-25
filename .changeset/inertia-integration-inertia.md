---
"@stratal/inertia": patch
---

Add Inertia.js v3 server adapter for building server-driven React SPAs with Stratal

### Details

- `InertiaModule` with `forRoot()` / `forRootAsync()` configuration
- `InertiaService` for rendering pages with shared data, deferred props, and partial reload support
- `@InertiaRoute()` decorator for Inertia-specific controller routes
- Inertia middleware for handling `X-Inertia` protocol (version checking, 409 conflict responses)
- Vite integration with dev CSS injection and automatic type generation plugins
- SSR rendering support via `@inertiajs/react/server`
- Quarry CLI commands: `inertia:dev`, `inertia:build`, `inertia:install`, `inertia:types`
