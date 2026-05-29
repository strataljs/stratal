---
"@stratal/feature-flags": patch
"@stratal/framework": patch
"@stratal/inertia": patch
---

Add `@stratal/feature-flags` — Cloudflare Flagship feature flags via the native Worker binding API.

- `FeatureFlagModule.forRoot({ apps: [{ binding, flags }], default, context })` with a declare-once flag manifest, manifest defaults, a per-request evaluation-context resolver, and multi-app support via `FeatureFlagService.use(binding)`.
- When `@stratal/inertia` is installed, `FeatureFlagModule` auto-shares evaluated flags to every Inertia page (no extra module/option); typed `useFlag` / `useFeatureFlags` hooks on `@stratal/feature-flags/react`. No runtime dependency on `@stratal/inertia`.
- `@stratal/inertia`: expose a generic `ctx.share(key, value)` macro on `RouterContext` so middleware and packages can contribute per-request shared props.
- `@stratal/framework`: add a `ctx.user()` macro on `RouterContext` (shorthand for `AuthContext.requireUser()`).
