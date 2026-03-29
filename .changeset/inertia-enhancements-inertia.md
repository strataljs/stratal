---
"@stratal/inertia": patch
---

Add precognition support, i18n integration, flash messages, React hooks, and testing utilities

### Details

- Add precognition middleware for form validation without full submission
- Add i18n integration with automatic locale and translation sharing to Inertia pages
- Add flash message support via cookie-based flash store
- Add `useRoute` and `useI18n` React hooks (`@stratal/inertia/react`)
- Add `@stratal/inertia/testing` subpath with TestResponse assertion augments for Inertia responses
- Enhance Vite configuration with Cloudflare Vite plugin support
