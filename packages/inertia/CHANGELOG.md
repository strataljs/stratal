# @stratal/inertia

## 0.0.18

### Patch Changes

- c9176ea: Add precognition support, i18n integration, flash messages, React hooks, and testing utilities

  ### Details

  - Add precognition middleware for form validation without full submission
  - Add i18n integration with automatic locale and translation sharing to Inertia pages
  - Add flash message support via cookie-based flash store
  - Add `useRoute` and `useI18n` React hooks (`@stratal/inertia/react`)
  - Add `@stratal/inertia/testing` subpath with TestResponse assertion augments for Inertia responses
  - Enhance Vite configuration with Cloudflare Vite plugin support

- 17f8675: Add Inertia.js v3 server adapter for building server-driven React SPAs with Stratal

  ### Details

  - `InertiaModule` with `forRoot()` / `forRootAsync()` configuration
  - `InertiaService` for rendering pages with shared data, deferred props, and partial reload support
  - `@InertiaRoute()` decorator for Inertia-specific controller routes
  - Inertia middleware for handling `X-Inertia` protocol (version checking, 409 conflict responses)
  - Vite integration with dev CSS injection and automatic type generation plugins
  - SSR rendering support via `@inertiajs/react/server`
  - Quarry CLI commands: `inertia:dev`, `inertia:build`, `inertia:install`, `inertia:types`

- Updated dependencies [fcb71c4]
- Updated dependencies [17f8675]
- Updated dependencies [c9176ea]
- Updated dependencies [c9176ea]
- Updated dependencies [c9176ea]
  - stratal@0.0.18
  - @stratal/testing@0.0.18
