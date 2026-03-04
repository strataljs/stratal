# RBAC and Guards

## Installation

```bash
npm install @stratal/framework
npm install casbin                           # required peer dep for RBAC
```

Also requires `@zenstackhq/orm` (via DatabaseModule) and a `casbinRule` model in the ZenStack schema.

## RbacModule Setup

### RbacModuleOptions

```typescript
interface RbacModuleOptions {
  model: string                                          // Casbin PERM model string (required)
  defaultPolicies?: readonly (readonly [string, string, string])[]  // [role, resource, action]
  roleHierarchy?: readonly (readonly [string, string])[] // [childRole, parentRole]
}
```

### forRoot()

```typescript
import { RbacModule } from '@stratal/framework/rbac'

@Module({
  imports: [
    RbacModule.forRoot({
      model: RBAC_MODEL,
      defaultPolicies: [
        ['admin', 'users:*', '.*'],
        ['user', 'posts:read', 'get'],
      ],
      roleHierarchy: [
        ['super_admin', 'admin'],
        ['admin', 'user'],
      ],
    }),
  ],
})
export class AppModule {}
```

### forRootAsync()

```typescript
RbacModule.forRootAsync({
  inject: [CONFIG_TOKENS.ConfigService],
  useFactory: async (config) => ({
    model: RBAC_MODEL,
    defaultPolicies: await loadPolicies(config),
  }),
})
```

**Peer dependency:** `casbin` must be installed. The ZenStack schema must include a `casbinRule` model.

## CasbinService (Request-Scoped)

Inject via `RBAC_TOKENS.CasbinService`. Decorated with `@Transient(RBAC_TOKENS.CasbinService)`.

```typescript
import { RBAC_TOKENS, type CasbinService } from '@stratal/framework/rbac'

@Transient()
export class RoleService {
  constructor(@inject(RBAC_TOKENS.CasbinService) private readonly casbin: CasbinService) {}
}
```

### User-Role Management

| Method | Signature | Description |
|--------|-----------|-------------|
| `addRoleForUser` | `(userId: string, role: string) => Promise<boolean>` | Assign role to user |
| `deleteRoleForUser` | `(userId: string, role: string) => Promise<boolean>` | Remove specific role from user |
| `deleteRolesForUser` | `(userId: string) => Promise<boolean>` | Remove all roles from user |
| `getRolesForUser` | `(userId: string) => Promise<string[]>` | Get direct roles (no inheritance) |
| `getImplicitRolesForUser` | `(userId: string) => Promise<string[]>` | Get all roles including inherited |
| `getUsersForRole` | `(role: string) => Promise<string[]>` | Get users with direct role |
| `getImplicitUsersForRole` | `(role: string) => Promise<string[]>` | Get users including inherited |
| `hasRoleForUser` | `(userId: string, role: string) => Promise<boolean>` | Check direct role assignment |

### Role Hierarchy

| Method | Signature | Description |
|--------|-----------|-------------|
| `addRoleInheritance` | `(childRole: string, parentRole: string) => Promise<boolean>` | Create hierarchy |
| `deleteRoleInheritance` | `(childRole: string, parentRole: string) => Promise<boolean>` | Remove hierarchy |

### User/Role Deletion

| Method | Signature | Description |
|--------|-----------|-------------|
| `deleteUser` | `(userId: string) => Promise<boolean>` | Remove all roles and policies for user |
| `deleteRole` | `(role: string) => Promise<boolean>` | Remove role from all users and policies |

### Convenience Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `getCurrentUserRoles` | `() => Promise<string[]>` | Current user's roles (includes inherited) |
| `currentUserHasRole` | `(role: string) => Promise<boolean>` | Check if current user has role |
| `setRolesForUser` | `(userId: string, roles: string[]) => Promise<void>` | Replace all roles for user |

### Permission Checking

| Method | Signature | Description |
|--------|-----------|-------------|
| `hasPermission` | `(userId: string, scope: string, action: string) => Promise<boolean>` | Check permission |
| `currentUserHasPermission` | `(scope: string, action: string) => Promise<boolean>` | Check current user's permission |
| `hasAnyPermission` | `(userId: string, scopes: string[], action: string) => Promise<boolean>` | Check ANY scope matches |
| `currentUserHasAnyPermission` | `(scopes: string[], action: string) => Promise<boolean>` | Check current user ANY scope |

### Frontend Permissions (Casbin.js)

| Method | Signature | Description |
|--------|-----------|-------------|
| `getPermissionsForUserAsCasbinJs` | `(userId: string) => Promise<Record<string, string[]>>` | Permissions as `{ [action]: resources[] }` |
| `getCurrentUserPermissionsAsCasbinJs` | `() => Promise<Record<string, string[]>>` | Current user's permissions |

## CasbinEnforcerService (Singleton)

Manages the Casbin enforcer instance. Decorated with `@Transient()`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `getEnforcer` | `() => Promise<Enforcer>` | Get or create enforcer (lazy, cached) |
| `seedPolicies` | `() => Promise<void>` | Seed `defaultPolicies` from options |
| `seedRoleHierarchy` | `() => Promise<void>` | Seed `roleHierarchy` from options |
| `clearCache` | `() => void` | Force enforcer recreation on next call |

## AuthGuard Factory

```typescript
import { AuthGuard } from '@stratal/framework/guards'
import { UseGuards } from 'stratal/guards'
```

### Signature

```typescript
function AuthGuard(options?: AuthGuardOptions): GuardClass

interface AuthGuardOptions {
  scopes?: string[]  // Required permissions for authorization
}
```

### Behavior

1. **Authentication check** — if user is not authenticated, throws `UserNotAuthenticatedError` (401)
2. **Authorization check** (only if `scopes` provided) — uses `CasbinService.hasAnyPermission(userId, scopes, httpMethod)`:
   - HTTP method (`ctx.c.req.method.toLowerCase()`) is used as the Casbin action
   - If no permission matches, throws `InsufficientPermissionsError` (403)
3. If no scopes provided, authentication-only guard

### Usage

```typescript
// Authentication only (401 if not logged in)
@Controller('/profile')
@UseGuards(AuthGuard())
export class ProfileController implements IController { ... }

// Authentication + Authorization (401 or 403)
@Controller('/admin')
@UseGuards(AuthGuard({ scopes: ['admin:dashboard'] }))
export class AdminController implements IController { ... }

// Per-route guard
@UseGuards(AuthGuard({ scopes: ['posts:write'] }))
async create(ctx: RouterContext) { ... }
```

## RBAC Errors

| Error Class | Code | Description |
|-------------|------|-------------|
| `InsufficientPermissionsError` | 3102 (`AUTHZ.INSUFFICIENT_PERMISSIONS`) | Missing required permissions (403) |

Constructor: `new InsufficientPermissionsError(requiredScopes: string[], userId?: string)`

## Tokens

```typescript
import { RBAC_TOKENS } from '@stratal/framework/rbac'

RBAC_TOKENS.CasbinService  // Symbol.for('CasbinService')
RBAC_TOKENS.Options         // Symbol.for('RbacModuleOptions')
```

## Casbin Model Example

Standard RBAC model with wildcard support:

```
[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act

[role_definition]
g = _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub) && keyMatch(r.obj, p.obj) && regexMatch(r.act, p.act)
```

### Policy Format

Stored in `casbinRule` table:

| ptype | v0 | v1 | v2 | Description |
|-------|----|----|----|-------------|
| `p` | `admin` | `users:*` | `.*` | Permission policy |
| `g` | `super_admin` | `admin` | — | Role hierarchy |
| `g` | `user123` | `admin` | — | User-role assignment |

The ZenStack schema must include:

```prisma
model CasbinRule {
  id    Int     @id @default(autoincrement())
  ptype String
  v0    String?
  v1    String?
  v2    String?
  v3    String?
  v4    String?
  v5    String?
}
```

## Import Paths

```typescript
// RBAC module, service, tokens
import { RbacModule, RBAC_TOKENS, type CasbinService, type RbacModuleOptions } from '@stratal/framework/rbac'
import { CasbinEnforcerService } from '@stratal/framework/rbac'
import { InsufficientPermissionsError } from '@stratal/framework/rbac'

// Auth guard
import { AuthGuard } from '@stratal/framework/guards'

// UseGuards decorator (from core)
import { UseGuards } from 'stratal/guards'
```
