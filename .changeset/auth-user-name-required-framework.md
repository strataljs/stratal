---
"@stratal/framework": patch
---

Require `name` on `AuthUser`

`AuthUser` now extends Better Auth's `BaseUser` directly, so `name` is required again (it was temporarily made optional in `0.0.20`). Apps whose schema stores `firstName`/`lastName` instead of a `name` column should expose `name` through a [ZenStack result extension](https://zenstack.dev/docs/orm/plugins/extending-orm-client#adding-fields-to-query-results) so reads return a populated `name` for free, rather than relying on `name` being absent.
