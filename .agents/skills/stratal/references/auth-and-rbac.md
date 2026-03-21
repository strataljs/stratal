# Authentication & RBAC

## AuthModule (Better Auth)

### Setup

```typescript
import { AuthModule } from '@stratal/framework/auth'
import { DI_TOKENS } from 'stratal/di'

@Module({
  imports: [
    AuthModule.forRootAsync({
      inject: [DI_TOKENS.Database],
      useFactory: (db) => createAuthOptions(db),
    }),
  ],
})
export class AppModule {}
```

The `createAuthOptions` pattern keeps auth config organized:

```typescript
// src/domain/auth/auth.options.ts
import type { BetterAuthOptions } from 'better-auth'

export function createAuthOptions(db: DatabaseService): BetterAuthOptions {
  return {
    database: db,
    emailAndPassword: { enabled: true },
    // ... other Better Auth options
  }
}
```

### AuthContext (Request-Scoped)

`AuthContext` is available in the request-scoped container. `SessionVerificationMiddleware` (auto-registered by AuthModule) populates it from session cookies/tokens on every request.

```typescript
import { AuthContext, AUTH_TOKENS } from '@stratal/framework/auth'
import { Transient, inject } from 'stratal/di'

@Transient()
@UseGuards(AuthGuard())
export class ProfileService {
  constructor(
    @inject(AUTH_TOKENS.AuthContext) private authContext: AuthContext,
  ) {}

  async getProfile() {
    const userId = this.authContext.userId
    const session = this.authContext.session
    // ...
  }
}
```

Prefer using `@UseGuards(AuthGuard())` on controllers instead of manually checking `authContext.isAuthenticated()` — the guard throws proper 401 errors automatically.

### AuthService

`AuthService` wraps Better Auth. The `auth` getter returns the Better Auth `Auth` instance with `.api` methods:

```typescript
import { AuthService, AUTH_TOKENS } from '@stratal/framework/auth'
import { Transient, inject } from 'stratal/di'

@Transient()
@UseGuards(AuthGuard())export class RegistrationService {
  constructor(
    @inject(AUTH_TOKENS.AuthService) private authService: AuthService,
  ) {}

  async listSessions(userId: string) {
    return this.authService.auth.api.listSessions({ query: { userId } })
  }

  async revokeSession(sessionToken: string) {
    return this.authService.auth.api.revokeSession({ body: { token: sessionToken } })
  }
}
```

## RBAC (Casbin)

### RbacModule Setup

```typescript
import { RbacModule } from '@stratal/framework/rbac'

@Module({
  imports: [
    RbacModule.forRootAsync({
      useFactory: () => ({
        model: casbinModelString,              // Casbin PERM model string
        defaultPolicies: [                     // Optional seed policies
          ['admin', 'users', 'read'],
          ['admin', 'users', 'write'],
        ],
        roleHierarchy: [                       // Optional role inheritance
          ['editor', 'viewer'],                // editor inherits viewer
        ],
      }),
    }),
  ],
})
export class AppModule {}
```

`RbacModuleOptions`: `{ model: string, defaultPolicies?: string[][], roleHierarchy?: string[][] }`

### CasbinService (Request-Scoped)

```typescript
import { CasbinService, RBAC_TOKENS } from '@stratal/framework/rbac'
import { Transient, inject } from 'stratal/di'

@Transient()
export class PermissionService {
  constructor(
    @inject(RBAC_TOKENS.CasbinService) private casbin: CasbinService,
  ) {}

  // Permission checking
  async checkAccess(userId: string, scope: string, action: string) {
    return this.casbin.hasPermission(userId, scope, action)
  }

  async checkAnyPermission(userId: string, scopes: string[], action: string) {
    return this.casbin.hasAnyPermission(userId, scopes, action)
  }

  // Current user convenience methods
  async currentUserCanRead(scope: string) {
    return this.casbin.currentUserHasPermission(scope, 'GET')
  }

  // Role management
  async getUserRoles(userId: string) {
    return this.casbin.getRolesForUser(userId)
  }

  async getImplicitRoles(userId: string) {
    return this.casbin.getImplicitRolesForUser(userId) // Includes inherited
  }

  async assignRole(userId: string, role: string) {
    return this.casbin.addRoleForUser(userId, role)
  }

  async setRoles(userId: string, roles: string[]) {
    return this.casbin.setRolesForUser(userId, roles) // Replace all roles
  }

  // Role hierarchy
  async addInheritance(childRole: string, parentRole: string) {
    return this.casbin.addRoleInheritance(childRole, parentRole)
  }

  // For frontend permission checks
  async getPermissionsForFrontend(userId: string) {
    return this.casbin.getPermissionsForUserAsCasbinJs(userId)
  }
}
```

## AuthGuard

Factory function that creates guards for authentication and optional authorization. Uses constructor injection internally — DI resolves `AuthContext`, `LoggerService`, and optionally `CasbinService`.

```typescript
import { AuthGuard } from '@stratal/framework/guards'
import { UseGuards } from 'stratal/router'

// Authentication only
@Controller('/api/v1/profile')
@UseGuards(AuthGuard())
export class ProfileController { ... }

// Authentication + authorization (scoped permissions)
@Controller('/api/v1/admin')
@UseGuards(AuthGuard({ scopes: ['admin:read', 'admin:write'] }))
export class AdminController { ... }

// Per-method guards
@Controller('/api/v1/notes')
export class NotesController {
  @UseGuards(AuthGuard())
  @Route({ response: noteSchema })
  async create(ctx: RouterContext) { ... }

  // No guard — public endpoint
  @Route({ response: z.array(noteSchema) })
  async index(ctx: RouterContext) { ... }
}
```

`AuthGuard()` throws `UserNotAuthenticatedError` (401) if not authenticated.
`AuthGuard({ scopes })` also checks `CasbinService.hasAnyPermission()` and throws `InsufficientPermissionsError` (403) if scopes fail.

## Auth Error Handling

AuthModule maps Better Auth errors to structured `ApplicationError` subclasses:
- `UserNotFoundError`, `InvalidCredentialsError`, `SessionExpiredError`
- `AccountAlreadyExistsError`, `EmailNotVerifiedError`, `InvalidTokenError`
- And more — see `@stratal/framework/auth` exports
