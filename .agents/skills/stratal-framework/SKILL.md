---
name: stratal-framework
description: >-
  Use when working with @stratal/framework — authentication (Better Auth), database
  (ZenStack ORM), RBAC (Casbin), AuthGuard, and test data factories. Trigger on:
  auth, AuthModule, AuthService, AuthContext, AuthGuard, Better Auth, database,
  DatabaseModule, DatabaseService, @InjectDB, ZenStack, RBAC, RbacModule,
  CasbinService, Casbin, Factory, Sequence, @stratal/framework, zenstack-plugin,
  @@connection, stratal-db, migrations, multi-connection, slicing,
  @stratal/zenstack-plugin.
user-invocable: false
license: MIT
metadata:
  author: Temitayo Fadojutimi
  version: "2.0"
---

# @stratal/framework

Higher-level framework modules for Stratal: authentication (Better Auth), database ORM (ZenStack), RBAC (Casbin), authorization guards, and test data factories. Full documentation at [stratal.dev/framework](https://stratal.dev/framework/overview).

## Authentication (AuthModule)

Docs: [Auth](https://stratal.dev/framework/auth)

```ts
@Module({
  imports: [
    AuthModule.forRootAsync({
      inject: [authConfig.KEY],
      useFactory: (config) => ({
        secret: config.secret,
        baseURL: config.baseURL,
        // ...Better Auth options
      }),
    }),
  ],
})
export class AppModule {}
```

`AuthContext` is request-scoped and available via `@inject(DI_TOKENS.AuthContext)`. Key methods: `isAuthenticated()`, `getUserId()`, `requireUserId()`, `getAuthContext()`. AuthModule auto-registers session verification middleware.

## Database (DatabaseModule)

Docs: [Database](https://stratal.dev/framework/database) · [Database Events](https://stratal.dev/framework/database-events)

```ts
import { PostgresDialect } from '@zenstackhq/orm/dialects/postgres';
import { Pool } from 'pg';

DatabaseModule.forRootAsync({
  inject: [DI_TOKENS.CloudflareEnv],
  useFactory: (env: StratalEnv) => ({
    schema,
    default: 'main',
    connections: [
      {
        name: 'main',
        dialect: () => new PostgresDialect({
          pool: new Pool({ connectionString: env.DB.connectionString, max: 1 }),
        }),
      },
    ],
  }),
})
```

**Type augmentation:**

```ts
declare module '@stratal/framework/database' {
  interface StratalDatabase {
    schema: SchemaType;
    defaultConnection: 'main';
    slicing: { main: { includedModels: readonly string[] } };
  }
}
```

Inject with `@inject(DI_TOKENS.Database)` (default connection) or `@InjectDB('name')` (named). Plugins: `EventEmitterPlugin`, `SchemaSwitcherPlugin`, `ErrorHandlerPlugin`.

**Database events** follow the pattern `{phase}.{Model}.{operation}` — e.g., `after.User.create`. Augment `CustomEventRegistry` with `DatabaseEvents<ConnectionName>` for type safety.

### Multi-Connection Schema Slicing (@stratal/zenstack-plugin)

The `@stratal/zenstack-plugin` splits a single `.zmodel` schema into per-connection schemas using the `@@connection` attribute, enabling connection-specific migrations.

**Plugin setup** in `.zmodel`:

```zmodel
plugin stratal {
  provider = '@stratal/zenstack-plugin'
  output = './zenstack'
  default = 'main'
}

model User {
  id String @id @default(cuid())
  @@connection('main')
}

model AuditLog {
  id String @id @default(cuid())
  @@connection('analytics')
}
```

Models without `@@connection` are assigned to the `default` connection.

**Generated output** after `npx zenstack generate`:

- `slicing.ts` — Export map used by `DatabaseModule` for connection-aware query routing
- Per-connection schemas — Separate Prisma schemas for each connection (used for migrations)

**CLI: stratal-db**

| Command | Description |
|---|---|
| `stratal-db migrate dev --connection <name> --name <name>` | Create a new migration |
| `stratal-db migrate deploy --connection <name>` | Apply pending migrations |
| `stratal-db migrate reset --connection <name>` | Reset database and re-apply migrations |
| `stratal-db push --connection <name>` | Push schema changes without migration files |
| `stratal-db migrate dev --all-connections` | Run migration on all connections at once |

**Conventions:**

- Always set a `default` connection in the plugin config
- Run `npx zenstack generate` before `stratal-db` commands to update schemas
- The generated `slicing.ts` integrates directly with `DatabaseModule.forRoot()` via the `slicing` option on each connection
- Cross-connection relations are validated at generation time — models in different connections cannot have direct relations

## RBAC (RbacModule)

Docs: [RBAC](https://stratal.dev/framework/rbac)

```ts
RbacModule.forRoot({
  model: casbinModel,
  defaultPolicies: [['admin', 'users:*', '.*']],
  roleHierarchy: [['super_admin', 'admin']],
})
```

`CasbinService` is request-scoped. Key methods: `hasPermission()`, `currentUserHasPermission()`, `hasAnyPermission()`, `currentUserHasAnyPermission()`, `addRoleForUser()`, `getRolesForUser()`, `getCurrentUserRoles()`. Requires a `CasbinRule` model in your ZenStack schema.

## AuthGuard

Docs: [AuthGuard](https://stratal.dev/framework/auth-guard)

```ts
// Auth only — checks isAuthenticated()
@UseGuards(AuthGuard())

// Auth + permissions — checks isAuthenticated() + CasbinService
@UseGuards(AuthGuard({ scopes: ['users:read'] }))
```

Throws `UserNotAuthenticatedError` (401) or `InsufficientPermissionsError` (403). Apply at class or method level.

## Test Factories

Docs: [Factories](https://stratal.dev/testing/factories)

```ts
export class UserFactory extends Factory<User, UserCreateInput> {
  protected model = 'user';
  protected definition() {
    return {
      email: this.faker.internet.email(),
      name: this.faker.person.fullName(),
    };
  }
  admin() {
    return this.state((attrs) => ({ ...attrs, role: 'admin' }));
  }
}
```

```ts
// Usage
const user = await new UserFactory().create(db);
const admins = await new UserFactory().admin().count(5).createManyAndReturn(db);
```

Methods: `make()` (build without saving), `create()` (persist), `makeMany()`, `createMany()`, `createManyAndReturn()`. Use `state()` for variants and `count()` for batch creation.

## Sub-path Imports

| Path | Key Exports |
|---|---|
| `@stratal/framework/auth` | `AuthModule`, `AuthService`, `AuthContext` |
| `@stratal/framework/database` | `DatabaseModule`, `DatabaseService`, `@InjectDB` |
| `@stratal/framework/rbac` | `RbacModule`, `CasbinService` |
| `@stratal/framework/guards` | `AuthGuard` |
| `@stratal/framework/factory` | `Factory`, `Sequence` |
| `@stratal/framework/context` | `RequestContext` |
