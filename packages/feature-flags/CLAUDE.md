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
  entrypoint: `FeatureFlagModule`, `FeatureFlagService`, `FeatureFlagInertiaModule`,
  tokens, error, types.
- React entry: `src/react.ts` → `dist/react.mjs` (`./react` export). Client hooks.
- Inertia auto-share: `src/inertia/` — re-exported from `src/index.ts`.

## Boundaries (don't cross-import)

- `src/index.ts` and its tree must not import React.
- `src/inertia/*` must import `@stratal/inertia` **type-only** (it only calls the
  runtime `ctx.share` macro + resolves `FeatureFlagService`). Keep these files
  side-effect-free so `FeatureFlagInertiaModule` tree-shakes away when unused.
- `src/react/*` must not import worker code.
- `"sideEffects": false` in package.json is load-bearing for tree-shaking — keep it.

## Conventions

- `FeatureFlagService` is `@Request`-scoped (the default-context resolver needs the
  current `RouterContext`, resolved gracefully via `container.tryResolve`).
- `use(binding)` returns a new **immutable** instance bound to another app — never
  mutate `this`.
- Flags must be declared once in the `apps[].flags` manifest (the binding has no
  enumeration API). `all()` evaluates the whole manifest for Inertia.
- DI tokens: `Symbol.for('stratal:feature-flags:...')` in `feature-flags.tokens.ts`.

## Testing

- `src/__tests__/` only. Run: `yarn workspace @stratal/feature-flags test`.
