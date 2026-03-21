---
"@stratal/framework": patch
---

Move auth, database, RBAC, and factory dependencies from optional peer dependencies to hard dependencies

### Details

- `@better-auth/core`, `better-auth`, `@faker-js/faker`, `@zenstackhq/cli`, `@zenstackhq/orm`, and `casbin` are now direct dependencies
- Remove `peerDependenciesMeta` optional markers for these packages
