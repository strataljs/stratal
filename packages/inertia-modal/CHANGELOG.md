# @stratal/inertia-modal

## 0.0.26

### Patch Changes

- Updated dependencies [ab95f52]
- Updated dependencies [ab95f52]
- Updated dependencies [bb6d3b9]
  - stratal@0.0.26
  - @stratal/inertia@0.0.26

## 0.0.25

### Patch Changes

- Updated dependencies [e93db60]
- Updated dependencies [e93db60]
  - stratal@0.0.25
  - @stratal/inertia@0.0.25

## 0.0.24

### Patch Changes

- Updated dependencies [10cf223]
  - @stratal/inertia@0.0.24
  - stratal@0.0.24

## 0.0.23

### Patch Changes

- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [13b0e8d]
- Updated dependencies [be813bc]
  - stratal@0.0.23
  - @stratal/inertia@0.0.23

## 0.0.22

### Patch Changes

- 4b273ea: Add `nativeBack` support to modal navigation and eagerly resolve deferred props in background page fetches

  - `useModal().redirect()` now uses `history.back()` instead of a server round-trip when the modal was loaded via a partial reload, providing instant close behavior.
  - Background page fetches send `x-inertia-resolve-deferred: true` to ensure deferred props are included in the response.

- 1658945: Fix modal component re-rendering by tracking component path instead of nonce
- Updated dependencies [1658945]
- Updated dependencies [1658945]
- Updated dependencies [4b273ea]
- Updated dependencies [4b273ea]
  - @stratal/inertia@0.0.22
  - stratal@0.0.22

## 0.0.21

### Patch Changes

- 3489cfd: Preserve query string and forwarded headers on modal background requests

  - The background page request now keeps the referer URL's query string, so opening a modal no longer resets the parent list view's filter/pagination state to defaults.
  - `x-forwarded-proto`, `x-forwarded-host`, `x-forwarded-for`, `x-forwarded-port`, `x-real-ip`, `accept-language`, and `user-agent` are forwarded from the original request when present. Middleware that reconstructs the canonical request URL (e.g. apps whose `appUrl` is derived from forwarded headers) now sees the same protocol/host as the original request, fixing background fetches that previously appeared unauthenticated because Better Auth's secure-cookie prefix was resolved against the wrong base URL.

- Updated dependencies [3489cfd]
- Updated dependencies [3489cfd]
- Updated dependencies [3489cfd]
- Updated dependencies [3489cfd]
  - stratal@0.0.21
  - @stratal/inertia@0.0.21

## 0.0.20

### Patch Changes

- f8c61e1: Loosen peer dependency ranges for broader compatibility

  Peer dependencies (`@inertiajs/core`, `@inertiajs/react`, `hono`, `react`, `reflect-metadata`, `stratal`) now use `>=` ranges instead of pinned `^` ranges, so apps can adopt newer majors of these packages without waiting for a coordinated bump.

- Updated dependencies [f8c61e1]
- Updated dependencies [f8c61e1]
- Updated dependencies [f8c61e1]
- Updated dependencies [f8c61e1]
- Updated dependencies [f8c61e1]
- Updated dependencies [f8c61e1]
- Updated dependencies [f8c61e1]
- Updated dependencies [f8c61e1]
- Updated dependencies [f8c61e1]
  - stratal@0.0.20
  - @stratal/inertia@0.0.20

## 0.0.19

### Patch Changes

- 5d26c24: Rearchitect i18n module augmentation to a per-module keyed registry (breaking change)

  **Why:** Multiple modules augmenting `AppMessages` with a shared top-level parent (e.g., `errors.auth`, `errors.uploads`, `errors.branding`) collided with TypeScript error **TS2717** ("Subsequent property declarations must have the same type"). Interface merging adds new properties across declarations but requires same-named properties to have structurally identical types — it does not deep-merge nested shapes.

  **What changed:**

  - Replaced the single augmentable `AppMessages` interface with an `AppMessageNamespaces` keyed registry. Each module declares its own distinct top-level key (Laravel-style package namespacing). Because each declaration adds a different property, interface merging accepts them all.
  - `AppMessages` is now derived: `{ [K in keyof AppMessageNamespaces]: AppMessageNamespaces[K] }`.
  - Access keys are unchanged dot-notation — `i18n.t('auth.errors.invalidCredentials')` — so no custom resolver is needed.

  **Migration:**

  Before:

  ```ts
  declare module "stratal/i18n" {
    interface AppMessages {
      errors: { uploads: { notFound: string } };
    }
  }
  ```

  After:

  ```ts
  declare module "stratal/i18n" {
    interface AppMessageNamespaces {
      uploads: { errors: { notFound: string } };
    }
  }
  ```

  **Framework package moves:**

  - All `errors.auth.*` keys (previously split between `stratal` core and `@stratal/framework`) now live in the auth module as `auth.errors.*`. `errors.auth.org.*` → `auth.org.*`. The `errors.auth.*` namespace has been removed from `stratal`'s core messages.
  - `@stratal/framework`'s `DatabaseModule` now registers its `database.*` validation messages via `I18nModule.registerMessages` (previously the messages file existed but was never wired up).
  - `@stratal/inertia-modal`'s `errors.modal.*` key moved to `modal.errors.*`.

  **Callsite updates required in downstream apps:**

  ```ts
  // Before
  new ApplicationError('errors.auth.invalidCredentials', ...)
  i18n.t('errors.auth.org.organizationNotFound')

  // After
  new ApplicationError('auth.errors.invalidCredentials', ...)
  i18n.t('auth.org.organizationNotFound')
  ```

  No runtime API change: `I18nModule.registerMessages(messages)` keeps its existing signature, and deep-merge behavior is unchanged. Locale-only contributions that override core's built-in `errors.*` / `common.*` / etc. continue to work.

- Updated dependencies [3b16f5b]
- Updated dependencies [5d26c24]
- Updated dependencies [5d26c24]
- Updated dependencies [3b16f5b]
- Updated dependencies [3b16f5b]
- Updated dependencies [5d26c24]
- Updated dependencies [5d26c24]
- Updated dependencies [3b16f5b]
  - stratal@0.0.19
  - @stratal/inertia@0.0.19
