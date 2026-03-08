---
name: stratal-framework
description: >-
  Use when working with @stratal/framework — authentication (Better Auth), database
  (ZenStack ORM), RBAC (Casbin), AuthGuard, and test data factories. Trigger on:
  auth, AuthModule, AuthService, AuthContext, AuthGuard, Better Auth, database,
  DatabaseModule, DatabaseService, @InjectDB, ZenStack, RBAC, RbacModule,
  CasbinService, Casbin, Factory, Sequence, @stratal/framework.
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
