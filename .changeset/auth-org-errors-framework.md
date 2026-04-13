---
"@stratal/framework": patch
---

Add organization-related error handling and internationalization support for auth module

- Add structured error codes and i18n messages for organization operations (not found, member not found, invitation errors, limit reached).
- Enhance Better Auth error handler to map organization-specific errors to appropriate HTTP responses.
