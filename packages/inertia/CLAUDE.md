# packages/inertia — CLAUDE.md

Maintainer rules for `@stratal/inertia`.

## Layout

- Server entry: `src/index.ts` → `dist/index.mjs` (`.` export).
- Vite plugin entry: `src/vite.ts` → `dist/vite.mjs` (`./vite` export). Runs in **Node**, not workerd.
- React entry: `src/react.ts` → `dist/react.mjs` (`./react` export).
- Testing helpers entry: `src/testing.ts` → `dist/testing.mjs` (`./testing` export).
- Quarry commands: `src/commands/inertia-{build,dev,install,types}.command.ts` — registered as providers in `InertiaModule` and invoked via `quarry inertia:*`.
- Type augmentation: `src/augment/{router-context,router-variables,test-response}.ts` — extends Stratal's types. Re-exported from package root via the `global.d.ts` reference (see Build hook).
- Decorators: `src/decorators/`. Flash store: `src/flash/`. Services: `src/services/`. Templates: `src/templates/`.

## Build hook (don't break it)

`tsdown.config.ts` has a `build:done` hook that prepends `/// <reference path="../global.d.ts" />` to `dist/index.d.mts`, `dist/vite.d.mts`, `dist/react.d.mts`. This is what wires the augmentations into consumer projects. If you rename a public entry (`index`/`vite`/`react`), update the hook's path list.

## Boundaries (don't cross-import)

- Server entry must not import from `./vite` (runs in Node, pulls Node-only deps) or from `./react` (pulls React/JSX into worker bundles).
- Vite entry must not import Cloudflare-Workers-specific code.
- React entry must not import worker-only code.
- SSR entry stays separate from the client bundle.

## Conventions

- New ctx method: implement runtime in `src/services/`, declare in `src/augment/router-context.ts`. Names must match.
- New decorator: register through the same metadata key Stratal's `@Route` uses — don't create a parallel registry.
- New flash store: implement the `CookieFlashStore` interface and register via DI token. Don't subclass.
- Adding a new top-level export entry requires three edits: `tsdown.config.ts` `entry`, the `build:done` hook's dts path list (if it ships augmentations), and (after build) verify the regenerated `package.json` `exports`.

## Testing

- `src/__tests__/` only (no E2E). Run: `yarn workspace @stratal/inertia test`.

## Reference

Consumer API walkthrough: `.agents/skills/stratal/references/inertia.md` (≈537 lines). Update it when public-facing decorators or methods change.
