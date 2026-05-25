---
"@stratal/framework": patch
---

Migrate all error classes to `HttpException`, move heavy dependencies to peer dependencies

### Breaking Changes

- **Error classes migrated** — All framework error classes (`InsufficientPermissionsError`, auth errors, database errors, context errors) now extend `HttpException` instead of `ApplicationError`. Constructor signatures are simplified — remove `i18nKey` and `code` arguments.
- **`@better-auth/core`, `@zenstackhq/orm`, `@zenstackhq/schema`, and `better-auth` moved to peer dependencies** — Install them directly in your application if not already present.
- **Database error mapping simplified** — `fromZenStackError()` no longer maps to typed error code objects. It returns plain `HttpException` instances with descriptive messages.
