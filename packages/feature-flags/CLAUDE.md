# packages/feature-flags — CLAUDE.md

Maintainer rules for `@stratal/feature-flags`. Consumer API depth lives in
`.agents/skills/stratal/references/feature-flags.md`.

## Scope

- Wraps **only** the Cloudflare Flagship **binding API** (`env.FLAGS`). No
  OpenFeature SDK (`@cloudflare/flagship`), no HTTP/server-provider fallback.
- The binding never throws — it returns the supplied `defaultValue` on error.
  Don't add a second fallback layer.

## Layout

- Server entry: `src/index.ts` → `dist/index.mjs` (`.` export). The worker
  entrypoint: `FeatureFlagModule`, `FeatureFlagService`, `FeatureFlagShareMiddleware`,
  tokens, error, types.
- React entry: `src/react.ts` → `dist/react.mjs` (`./react` export). Client hooks.
- Inertia share middleware: `src/feature-flag-share.middleware.ts` — exported from
  `src/index.ts`. **Not** registered by `FeatureFlagModule`; consumers register it
  themselves (scoped or global) so a stalled Flagship binding can't block every route.

## Boundaries (don't cross-import)

- `src/index.ts` and its tree must not import React.
- `feature-flag-share.middleware.ts` self-declares the `ctx.share` type and only
  calls the runtime macro behind a `typeof` guard — **zero** compile/runtime
  dependency on `@stratal/inertia`. Keep it that way (and side-effect-free) so it
  tree-shakes away when unused.
- `src/react/*` must not import worker code.
- `"sideEffects": false` in package.json is load-bearing for tree-shaking — keep it.

## Conventions

- `FeatureFlagService` is `@Transient`. It works in and out of a request: the
  default-context resolver runs only when a `RouterContext` is present (injected
  with `isOptional`), and is skipped otherwise. It is **not** `@Request`-scoped —
  request-scoped providers now throw when resolved outside a request, and this
  service is designed to resolve from global/queue/cron scope too.
- `use(binding)` returns a new **immutable** instance bound to another app — never
  mutate `this`.
- Flags must be declared once in the `apps[].flags` manifest (the binding has no
  enumeration API). `all()` evaluates the whole manifest for Inertia.
- DI tokens: `Symbol.for('stratal:feature-flags:...')` in `feature-flags.tokens.ts`.

## Testing

- `src/__tests__/` only. Run: `yarn workspace @stratal/feature-flags test`.
