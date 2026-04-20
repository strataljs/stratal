---
"stratal": major
"@stratal/framework": major
"@stratal/inertia-modal": major
---

Rearchitect i18n module augmentation to a per-module keyed registry (breaking change)

**Why:** Multiple modules augmenting `AppMessages` with a shared top-level parent (e.g., `errors.auth`, `errors.uploads`, `errors.branding`) collided with TypeScript error **TS2717** ("Subsequent property declarations must have the same type"). Interface merging adds new properties across declarations but requires same-named properties to have structurally identical types — it does not deep-merge nested shapes.

**What changed:**

- Replaced the single augmentable `AppMessages` interface with an `AppMessageNamespaces` keyed registry. Each module declares its own distinct top-level key (Laravel-style package namespacing). Because each declaration adds a different property, interface merging accepts them all.
- `AppMessages` is now derived: `{ [K in keyof AppMessageNamespaces]: AppMessageNamespaces[K] }`.
- Access keys are unchanged dot-notation — `i18n.t('auth.errors.invalidCredentials')` — so no custom resolver is needed.

**Migration:**

Before:
```ts
declare module 'stratal/i18n' {
  interface AppMessages {
    errors: { uploads: { notFound: string } }
  }
}
```

After:
```ts
declare module 'stratal/i18n' {
  interface AppMessageNamespaces {
    uploads: { errors: { notFound: string } }
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
