# Authentication & Access Control

## AuthModule (Better Auth)

### Setup

```typescript
import { AuthModule } from '@stratal/framework/auth'
import { DI_TOKENS } from 'stratal/di'

@Module({
  imports: [
    AuthModule.forRootAsync({
      useFactory: (db, env) => ({
        database: db,
        emailAndPassword: { enabled: true },
        // ... other Better Auth options
      }),
      inject: [DI_TOKENS.Database, DI_TOKENS.Env],
    }),
  ],
})
export class AppModule {}
```

### AuthContext (Request-Scoped)

`AuthContext` is available in the request-scoped container. `SessionVerificationMiddleware` (auto-registered by AuthModule) populates it from session cookies/tokens on every request.

```typescript
import type { AuthContext } from '@stratal/framework/context'
import { DI_TOKENS } from 'stratal/di'
import { Transient, inject } from 'stratal/di'

@Transient()
@UseGuards(AuthGuard())
export class ProfileService {
  constructor(
    @inject(DI_TOKENS.AuthContext) private authContext: AuthContext,
  ) {}

  async getProfile() {
    const userId = this.authContext.requireUserId() // throws 401 if not authenticated
    const roles  = this.authContext.getRoles()      // string[] — e.g. ['admin', 'editor']
    const role   = this.authContext.getRole()       // raw comma-separated string from DB
  }
}
```

Prefer `@UseGuards(AuthGuard())` on controllers over manually checking `authContext.isAuthenticated()` — the guard throws proper 401 errors automatically.

### AuthService

`AuthService` wraps Better Auth. The `auth` getter returns the Better Auth `Auth` instance with `.api` methods:

```typescript
import type { AuthService } from '@stratal/framework/auth'
import { AUTH_SERVICE } from '@stratal/framework/auth'
import { Transient, inject } from 'stratal/di'

@Transient()
@UseGuards(AuthGuard())
export class SessionService {
  constructor(
    @inject(AUTH_SERVICE) private authService: AuthService,
  ) {}

  async listSessions(userId: string) {
    return this.authService.auth.api.listSessions({ query: { userId } })
  }

  async revokeSession(sessionToken: string) {
    return this.authService.auth.api.revokeSession({ body: { token: sessionToken } })
  }
}
```

## Access Control

Stratal's access control is built on Better Auth's `access` plugin. Define resources and roles once, then use `AuthGuard` for declarative enforcement or `AccessService` for runtime checks.

### Setup

```typescript
import { createAccessControl } from '@stratal/framework/access-control'
import { AuthModule } from '@stratal/framework/auth'

// permissions.ts — define once, use everywhere
export const permissions = createAccessControl({
  resources: {
    posts:    ['create', 'read', 'update', 'delete'],
    comments: ['create', 'read', 'delete'],
    admin:    ['access'],
  } as const,
  roles: {
    user:  { posts: ['create', 'read'], comments: ['create', 'read'] },
    editor: { posts: ['create', 'read', 'update'], comments: ['create', 'read', 'delete'] },
    admin: { posts: ['create', 'read', 'update', 'delete'], comments: ['create', 'read', 'delete'], admin: ['access'] },
  },
})

// app.module.ts
@Module({
  imports: [
    AuthModule.forRootAsync({
      useFactory: (db) => ({
        database: db,
        emailAndPassword: { enabled: true },
        accessControl: permissions,  // enables permission enforcement
      }),
      inject: [DI_TOKENS.Database],
    }),
  ],
})
export class AppModule {}
```

The `permissions` object from `createAccessControl()` can also spread into Better Auth plugins like `admin()`:

```typescript
import { admin } from 'better-auth/plugins'

plugins: [admin({ ...permissions })]
```

### Extending Roles

Use `extendRole()` to compose roles. Duplicate resource keys are merged (actions unioned), not overwritten:

```typescript
import { extendRole } from '@stratal/framework/access-control'
import { permissions } from './permissions'

const { ac, roles } = permissions

// superAdmin inherits all admin permissions + extra
const superAdminRole = extendRole(ac, roles.admin, {
  users: ['ban', 'delete', 'impersonate'],
})

// editorPlus gets editor's posts permissions + delete
const editorPlusRole = extendRole(ac, roles.editor, {
  posts: ['delete'],  // merged with existing ['create', 'read', 'update'] → union
})
```

### AuthGuard — Declarative Permission Enforcement

Prefer guards over calling `AccessService` directly in controllers. Guards run before route handlers and throw the right HTTP errors automatically.

```typescript
import { AuthGuard } from '@stratal/framework/guards'
import { UseGuards } from 'stratal/router'

// Authentication only (401 if not logged in)
@Controller('/api/v1/profile')
@UseGuards(AuthGuard())
export class ProfileController { ... }

// Authentication + permission check (401 or 403)
@Controller('/api/v1/admin')
@UseGuards(AuthGuard({ permissions: 'admin:access' }))
export class AdminController { ... }

// Multiple permissions — any one grants access
@UseGuards(AuthGuard({ permissions: ['posts:update', 'posts:delete'] }))

// Wildcard — any action on the resource
@UseGuards(AuthGuard({ permissions: 'posts' }))

// Per-method guards
@Controller('/api/v1/posts')
export class PostsController {
  @UseGuards(AuthGuard({ permissions: 'posts:create' }))
  @Route({ body: createPostSchema, response: postSchema })
  async create(ctx: RouterContext) { ... }

  // Public — no guard
  @Route({ response: z.array(postSchema) })
  async index(ctx: RouterContext) { ... }
}
```

Permission syntax: `"resource:action"` — resource and action must match a key/value defined in `createAccessControl()`.

Errors thrown:
- `UserNotAuthenticatedError` — 401, user not logged in
- `InsufficientPermissionsError` — 403, user logged in but lacks required permissions

Permission checks read from `AuthContext` (no DB hit) — the user's role is stored in the session.

### AccessService — Runtime Permission Checks

Use `AccessService` for programmatic checks (e.g. filtering results, conditional logic, admin tools). Inject via `AC_TOKENS.AccessService`.

```typescript
import { AccessService, AC_TOKENS } from '@stratal/framework/access-control'
import { Transient, inject } from 'stratal/di'

@Transient()
export class PostsService {
  constructor(
    @inject(AC_TOKENS.AccessService) private access: AccessService,
  ) {}

  // Current user — reads from AuthContext (no DB hit, prefer this)
  async canEditPost() {
    return this.access.currentUserHasPermission({ posts: ['update'] })
  }

  async getCurrentUserPermissions() {
    return this.access.getCurrentUserPermissions()
    // → { posts: ['create', 'read', 'update'], comments: ['create', 'read'] }
  }

  getCurrentUserRoles() {
    return this.access.getCurrentUserRoles()
    // → ['editor']
  }

  // Arbitrary user — hits DB to look up their role
  async canUserDeletePost(userId: string) {
    return this.access.hasPermission(userId, { posts: ['delete'] })
  }

  // Role management (admin actions)
  async promoteToAdmin(userId: string) {
    await this.access.setUserRole(userId, 'admin')
  }

  async assignMultipleRoles(userId: string) {
    await this.access.setUserRole(userId, ['editor', 'reviewer'])
  }

  async getUserRoles(userId: string) {
    return this.access.getUserRoles(userId)
    // → ['editor', 'reviewer']
  }
}
```

**Prefer `currentUserHasPermission()` over `hasPermission()` for the current user** — no DB hit, reads directly from the session.

## Auth Error Handling

AuthModule maps Better Auth errors to structured `ApplicationError` subclasses:
- `UserNotFoundError`, `InvalidCredentialsError`, `SessionExpiredError`
- `AccountAlreadyExistsError`, `EmailNotVerifiedError`, `InvalidTokenError`
- `InsufficientPermissionsError` — thrown by `AuthGuard` when authorization fails (403)
- And more — see `@stratal/framework/auth` exports
