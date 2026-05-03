---
"@stratal/framework": patch
---

Store the full authenticated user on `AuthContext`

`AuthContext` now holds the full user record returned by Better Auth's `getSession()` instead of just `userId`/`role`, so controllers and services can read profile fields without re-querying the database.

### Breaking Changes

- `AuthInfo` shape changed from `{ userId?, role? }` to `{ user: AuthUser }`. `setAuthContext({ userId, role })` callers must pass `setAuthContext({ user })` instead.
- `getAuthContext()` was renamed to `getAuthInfo()` and now returns `{ user }`.
- `AuthContext.getRole()` reads from `user.role`. Apps that use roles should augment the new `AuthUser` interface with `role: string` (or your app's role field) so it stays typed.

### New API

- `AuthUser` interface (extends Better Auth's `BaseUser` with optional `name`) is augmentable via `declare module '@stratal/framework/context'` for app-specific fields.
- `AuthContext.getUser()` returns the user or `undefined`.
- `AuthContext.requireUser()` returns the user or throws `UserNotAuthenticatedError`.

### Migration

```ts
// Before
const userId = authContext.getAuthContext().userId
authContext.setAuthContext({ userId: session.user.id, role: session.user.role })

// After
const user = authContext.requireUser()
authContext.setAuthContext({ user: session.user })
```
