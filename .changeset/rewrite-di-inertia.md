---
"@stratal/inertia": patch
---

Replace @intlify/core-base with intl-messageformat in `useI18n` hook, add eager deferred prop resolution, and remove tsyringe/reflect-metadata dependencies

- `useI18n()` now uses `intl-messageformat` for ICU message formatting. The hook API is unchanged.
- New `x-inertia-resolve-deferred` request header causes all deferred props to be resolved eagerly in the response, skipping client-side lazy loading.
- The `invokeReflectMetadataBeforeTsyringeCheck` Vite plugin is removed (no longer needed).
- `reflect-metadata` and `@intlify/core-base` are no longer peer dependencies.
