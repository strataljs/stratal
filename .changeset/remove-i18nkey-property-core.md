---
"stratal": patch
---

Remove redundant `i18nKey` property from `ApplicationError` and use `Error.message` instead

### Details

- Remove `i18nKey` property — the i18n key is already stored in `Error.message` via `super(i18nKey)`
- `toErrorResponse()` now uses `this.message` for fallback and stack trace rewriting
- `GlobalErrorHandler.translateError()` casts `error.message as MessageKeys` for i18n lookup
- Stack traces in development mode now rewrite the first line with the translated message for readable debugging
