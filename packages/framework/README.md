# @stratal/framework

Authentication, database ORM, access control, guards, and test factories for [Stratal](https://stratal.dev) applications.

[![npm version](https://img.shields.io/npm/v/@stratal/framework)](https://www.npmjs.com/package/@stratal/framework)
[![CI](https://github.com/strataljs/stratal/actions/workflows/ci.yml/badge.svg)](https://github.com/strataljs/stratal/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/strataljs/stratal/badge)](https://securityscorecards.dev/viewer/?uri=github.com/strataljs/stratal)
[![Known Vulnerabilities](https://snyk.io/test/github/strataljs/stratal/badge.svg)](https://snyk.io/test/github/strataljs/stratal)
[![npm downloads](https://img.shields.io/npm/dm/@stratal/framework)](https://www.npmjs.com/package/@stratal/framework)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/@stratal/framework)](https://bundlephobia.com/package/@stratal/framework)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/strataljs/stratal/pulls)
[![GitHub stars](https://img.shields.io/github/stars/strataljs/stratal?style=social)](https://github.com/strataljs/stratal)

## What's inside

- **DatabaseModule** — ZenStack ORM with multiple named connections, plus `db:*` and `migrate:*` Quarry commands
- **AuthModule** — Better Auth integration with session verification middleware and a `ctx.user()` shorthand
- **Access control** — Resources, roles and permissions built on Better Auth's `access` plugin
- **AuthGuard** — Authentication and permission enforcement for routes and controllers
- **AuthContext** — Request-scoped user context for the authenticated user
- **Factory** — Test data factories with sequenced attributes powered by Faker.js

## Installation

```bash
npm install @stratal/framework
# or
yarn add @stratal/framework
```

### Peer dependencies

| Package | Notes |
|---|---|
| `stratal` | The core framework |
| `@zenstackhq/orm` | ORM runtime |
| `@zenstackhq/schema` | Generated schema types |
| `pg` | PostgreSQL driver |
| `better-auth` | Authentication |
| `@better-auth/core` | Authentication |

### Sub-path exports

```typescript
import { AuthModule } from '@stratal/framework/auth'
import { DatabaseModule } from '@stratal/framework/database'
import { createAccessControl } from '@stratal/framework/access-control'
import { AuthGuard } from '@stratal/framework/guards'
import type { AuthContext, AuthUser } from '@stratal/framework/context'
import { Factory } from '@stratal/framework/factory'
```

### AI Agent Skills

Stratal provides [Agent Skills](https://agentskills.io) for AI coding assistants like Claude Code and Cursor. Install to give your AI agent knowledge of Stratal patterns, conventions, and APIs:

```bash
npx skills add strataljs/stratal
```

| Skill | Description |
|---|---|
| `stratal` | Build Cloudflare Workers apps with the Stratal framework — modules, DI, controllers, routing, OpenAPI, queues, cron, events, seeders, CLI, auth, database, access control, testing, and more |

## Quick Start

```typescript
import { Stratal } from 'stratal'
import { DI_TOKENS } from 'stratal/di'
import { Module } from 'stratal/module'
import { AuthModule } from '@stratal/framework/auth'
import { createPoolFactory, DatabaseModule } from '@stratal/framework/database'
import { PostgresDialect } from 'kysely'
import { Pool } from 'pg'
import { permissions } from './permissions'
import { schema } from './zenstack/schema'

@Module({
  imports: [
    DatabaseModule.forRootAsync({
      inject: [DI_TOKENS.CloudflareEnv],
      useFactory: (env) => ({
        default: 'main',
        connections: [
          {
            name: 'main',
            schema,
            dialect: () => new PostgresDialect({
              pool: createPoolFactory(env, () => new Pool({
                connectionString: env.HYPERDRIVE.connectionString,
              })),
            }),
          },
        ],
      }),
    }),
    AuthModule.forRootAsync({
      inject: [DI_TOKENS.Database],
      useFactory: (db) => ({
        database: db,
        emailAndPassword: { enabled: true },
        accessControl: permissions,
      }),
    }),
  ],
})
class AppModule {}

export default new Stratal({ module: AppModule })
```

A connection takes a generated ZenStack `schema` and a `dialect` factory. `createPoolFactory()` picks the connection topology from the environment — a fresh pool per resolution behind Hyperdrive in production, one shared pool under `@stratal/testing` — so your app config never branches on whether it is running under test.

The factory is only called when the module initializes, so a large generated schema can sit behind an `import()` and stay out of the isolate's startup budget.

## Access control

Define resources and roles once with `createAccessControl()`, then hand the result to Better Auth:

```typescript
// permissions.ts
import { createAccessControl } from '@stratal/framework/access-control'

export const permissions = createAccessControl({
  resources: {
    posts: ['create', 'read', 'update', 'delete'],
    admin: ['access'],
  } as const,
  roles: {
    user: { posts: ['create', 'read'] },
    editor: { posts: ['create', 'read', 'update'] },
    admin: { posts: ['create', 'read', 'update', 'delete'], admin: ['access'] },
  },
})
```

Compose roles with `extendRole()` — duplicate resource keys are merged, not overwritten:

```typescript
import { extendRole } from '@stratal/framework/access-control'

const { ac, roles } = permissions
const superAdmin = extendRole(ac, roles.admin, { users: ['ban', 'delete'] })
```

## Guards

`AuthGuard()` enforces authentication; pass `permissions` to enforce authorization too. Prefer guards over checking the auth context by hand — they throw the right 401 / 403 automatically.

```typescript
import { AuthGuard } from '@stratal/framework/guards'
import { UseGuards } from 'stratal/guards'
import { Controller } from 'stratal/router'

@Controller('/profile', { version: '1' })
@UseGuards(AuthGuard())
export class ProfileController {}

@Controller('/admin', { version: '1' })
@UseGuards(AuthGuard({ permissions: 'admin:access' }))
export class AdminController {}

// Several permissions — all must be satisfied by one of the user's roles
@Controller('/posts', { version: '1' })
@UseGuards(AuthGuard({ permissions: ['posts:update', 'posts:delete'] }))
export class PostsController {}
```

Permissions are written `resource:action`; `resource` alone means "any action on that resource". A list is combined with AND — every permission must be granted — while a user holding several roles passes if any one role satisfies the whole list.

Guards can also be applied per method, and combined with Stratal's [versioning](https://stratal.dev) so the version never has to be written into the path.

## Reading the authenticated user

Enforcement belongs on the guard, not in the handler. Once `AuthGuard()` is applied, the route only runs for an authenticated user, so reading the user is just a read:

```typescript
@Controller('/profile', { version: '1' })
@UseGuards(AuthGuard())
export class ProfileController {
  async show(ctx: RouterContext) {
    return ctx.json(await this.service.forUser(ctx.user().id))
  }
}
```

`ctx.user()` is a `RouterContext` shorthand that `AuthModule` adds. Inject `AuthContext` where you don't have the request context to hand:

```typescript
import type { AuthContext } from '@stratal/framework/context'
import { DI_TOKENS, inject, Transient } from 'stratal/di'

@Transient()
export class ProfileService {
  constructor(@inject(DI_TOKENS.AuthContext) private auth: AuthContext) {}

  profile() {
    return this.auth.requireUser()
  }
}
```

`requireUser()` throws `UserNotAuthenticatedError` when signed out — a backstop for code reachable outside a guarded route, not a substitute for the guard. `getUser()` returns `AuthUser | undefined` instead of throwing, and `getRoles()` splits `user.role` on commas.

Augment `AuthUser` to type your own fields:

```typescript
declare module '@stratal/framework/context' {
  interface AuthUser {
    firstName: string
    role: string
  }
}
```

## Documentation

Full guides and examples are available at **[stratal.dev](https://stratal.dev)**.

## Support the project

If Stratal is useful to you, **[star the repository](https://github.com/strataljs/stratal)** — it is the simplest way to help others find it.

## Maintainer

Built and maintained by **Temitayo Fadojutimi** — [@adesege_](https://x.com/adesege_).

## License

MIT
