# 13 - RBAC

Role-based access control with Casbin, integrated with Auth and Database modules.

## What it demonstrates

- `RbacModule.forRoot({ model, defaultPolicies, roleHierarchy })` configuration
- Casbin PERM model definition (request, policy, role, matchers)
- `AuthGuard({ scopes: ['resource:action'] })` for route authorization
- Method-level `@UseGuards()` for granular permission control (read vs write)
- `CasbinService` injection via `RBAC_TOKENS.CasbinService`
- Event listener auto-syncs `User.role` to Casbin grouping policies on create/update
- Database seeder for populating default RBAC policies and role hierarchy
- Role management: `getCurrentUserRoles()`, `addRoleForUser()`, `deleteRoleForUser()`
- Frontend permissions: `getCurrentUserPermissionsAsCasbinJs()` returns `{ action: [scopes] }`
- Full Auth + Database + RBAC integration stack
- PostgreSQL via Hyperdrive with `PostgresDialect` and ZenStack v3 schema
- `zenstackAdapter` from `@zenstackhq/better-auth` for shared database connection in auth
- `StratalEnv extends Cloudflare.Env` for auto-generated environment types

## Prerequisites

1. Start the PostgreSQL database:

```bash
cd examples/13-rbac
npm run db:up
```

2. Install dependencies and generate types:

```bash
npm install
npm run generate
npm run wrangler:types
```

3. Push the schema to the database:

```bash
npm run db:push
```

4. Seed RBAC policies and role hierarchy:

```bash
npm run seed -- run rbac
```

## Running

```bash
cd examples/13-rbac
npx wrangler dev
```

## API endpoints

| Method | Path                  | Description                                | Permission        |
|--------|-----------------------|--------------------------------------------|-------------------|
| POST   | /api/auth/*           | Better Auth endpoints (auto-mounted)       | Public            |
| GET    | /api/articles         | List articles                              | `articles:read`   |
| POST   | /api/articles         | Create an article                          | `articles:write`  |
| GET    | /api/roles            | Get current user's roles                   | `roles:*`         |
| GET    | /api/roles/permissions| Get current user's permissions             | `roles:*`         |
| POST   | /api/roles/assign     | Assign a role to a user                    | `roles:*`         |
| POST   | /api/roles/revoke     | Revoke a role from a user                  | `roles:*`         |

## Example requests

```bash
# 1. Sign up a user (auto-assigned 'user' role, event listener syncs to Casbin)
curl -X POST http://localhost:8787/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -d '{"name": "Admin User", "email": "admin@example.com", "password": "password123"}' \
  -c cookies.txt

# 2. To make the user an admin, update the role in the database:
#    UPDATE "User" SET role = 'admin' WHERE email = 'admin@example.com';
#    The event listener will auto-sync the new role to Casbin on next DB update.

# 3. Try reading articles (requires articles:read — viewer, editor, or admin)
curl http://localhost:8787/api/articles -b cookies.txt

# 4. Try creating an article (requires articles:write — editor or admin only)
curl -X POST http://localhost:8787/api/articles \
  -H 'Content-Type: application/json' \
  -d '{"title": "My Article", "content": "Hello world"}' \
  -b cookies.txt

# 5. View your roles and permissions (requires roles:* — admin only)
curl http://localhost:8787/api/roles -b cookies.txt
curl http://localhost:8787/api/roles/permissions -b cookies.txt

# 6. Assign a role to another user
curl -X POST http://localhost:8787/api/roles/assign \
  -H 'Content-Type: application/json' \
  -d '{"userId": "<user-id>", "role": "editor"}' \
  -b cookies.txt
```

## Role hierarchy

```
admin (inherits editor)
  └── editor (inherits viewer)
       └── viewer
```

- **viewer**: Can read articles (`articles:read`)
- **editor**: Can read and write articles (`articles:read`, `articles:write`)
- **admin**: Full access to articles and role management (`articles:*`, `roles:*`)

## Key files

- [`db/schema.zmodel`](db/schema.zmodel) - ZenStack v3 schema with User, Article, and CasbinRule models (PostgreSQL)
- [`src/rbac/rbac.config.ts`](src/rbac/rbac.config.ts) - Casbin PERM model, default policies, role hierarchy
- [`src/app.module.ts`](src/app.module.ts) - Full Auth + Database + RBAC module composition
- [`src/listeners/user-role-sync.listener.ts`](src/listeners/user-role-sync.listener.ts) - Syncs `User.role` to Casbin on create/update
- [`src/seeders/rbac.seeder.ts`](src/seeders/rbac.seeder.ts) - Seeds default RBAC policies and role hierarchy
- [`src/articles/articles.controller.ts`](src/articles/articles.controller.ts) - Method-level `AuthGuard` with scopes
- [`src/roles/roles.controller.ts`](src/roles/roles.controller.ts) - `CasbinService` for role/permission management
- [`src/database/database.config.ts`](src/database/database.config.ts) - Database connection factory with PostgresDialect + Hyperdrive
- [`src/auth/auth.config.ts`](src/auth/auth.config.ts) - Auth config with `zenstackAdapter` for shared database connection
- [`src/types/env.ts`](src/types/env.ts) - `StratalEnv extends Cloudflare.Env` augmentation
