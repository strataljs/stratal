# packages/inertia-modal — CLAUDE.md

Maintainer rules for `@stratal/inertia-modal`.

## Layout

- Server entry: `src/index.ts` → `dist/index.mjs` (`.` export).
- React entry: `src/react.tsx` → `dist/react.mjs` (`./react` export).
- Module: `src/modal.module.ts` (`ModalModule`). Tokens: `src/tokens.ts`. Services: `src/services/`. Errors: `src/errors/`. i18n messages: `src/i18n/`.
- Type augmentation: `src/augment/router-context.ts` — extends Stratal context with the modal ctx method.

## Boundaries (don't cross-import)

- Server entry (`./`) must not import from `./react`. React entry must not import server-only code.
- Built on top of `@stratal/inertia` — peer-deps it, don't bundle. Keep `@stratal/inertia` in `peerDependencies`, never in `dependencies`.

## Conventions

- New modal-related provider: register in `ModalModule.providers`, not in `InertiaModule`.
- Augmentation rule (same as `@stratal/inertia`): runtime impl in `src/services/` and the type declaration in `src/augment/router-context.ts` must agree on names.
- Errors: throw types from `src/errors/`; register i18n messages through `I18nModule`, namespaced (match the pattern used in `@stratal/framework`).

## Reference

Consumer API walkthrough: `.agents/skills/stratal/references/inertia-modal.md`. Update it when the public surface changes.
