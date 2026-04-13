---
"@stratal/framework": patch
---

Replace Casbin-based RBAC module with Better Auth access control module

### Breaking Changes

- The `RbacModule`, `CasbinService`, `CasbinEnforcerService`, and all Casbin-related exports under `@stratal/framework/rbac` have been removed.
- Use the new `@stratal/framework/access-control` module instead, which integrates with Better Auth's built-in access control system.
- `AuthGuard` now uses `AccessService` instead of `CasbinService` for permission checks.

### Migration

1. Replace `RbacModule` imports with the new access control setup via `createAccessControl()`.
2. Define resources and roles using `createAccessControl({ resources, roles })` and pass the result to `AuthModule.forRootAsync()`.
3. Replace `CasbinService` usage with `AccessService` from `@stratal/framework/access-control`.
