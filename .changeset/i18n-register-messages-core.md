---
"stratal": minor
---

Add `I18nModule.registerMessages()` for decentralized i18n message registration

### Details

- Any module can now call `I18nModule.registerMessages()` to contribute translations, enabling package-level message ownership
- Messages are deep-merged across all registrations in order — later calls override earlier ones at leaf level
- `RouterContext.json()` now accepts `null` and automatically returns 204 No Content

### Breaking Changes

- Remove `messages` option from `I18nModule.forRoot()` — use `I18nModule.registerMessages()` instead

  **Before:**
  ```typescript
  I18nModule.forRoot({
    defaultLocale: 'en',
    messages: { en: { ... }, fr: { ... } },
  })
  ```

  **After:**
  ```typescript
  I18nModule.forRoot({ defaultLocale: 'en' }),
  I18nModule.registerMessages({ en: { ... }, fr: { ... } }),
  ```
