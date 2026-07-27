import { PostgresDialect } from '@zenstackhq/orm/dialects/postgres'
import { Pool, type PoolConfig } from 'pg'
import { type StratalEnv } from 'stratal'
import { DI_TOKENS } from 'stratal/di'
import { Module } from 'stratal/module'
import { createAccessControl } from '../../src/access-control/create-access-control'
import { extendRole } from '../../src/access-control/extend-role'
import { AuthModule } from '../../src/auth/auth.module'
import { customPgTypes } from '../../src/database/custom-pg-types'
import { DatabaseModule } from '../../src/database/database.module'
import { createPoolFactory, DB_SHARED_POOL_ENV } from '../../src/database/pool'
import type { DatabaseService } from '../../src/database/database.service'
import { UserSeeder } from '../seeders/user.seeder'
import { schema } from '../zenstack/schema'
import { createTestAuthOptions } from './auth-options'
import { AdminController } from './controllers/admin.controller'
import { PostsController } from './controllers/posts.controller'
import { PublicController } from './controllers/public.controller'
import { UsersController } from './controllers/users.controller'

export const permissions = createAccessControl({
  resources: {
    posts: ['create', 'read', 'update', 'delete'],
    users: ['list'],
    admin: ['access'],
  } as const,
  roles: {
    admin: { posts: ['create', 'read', 'update', 'delete'], users: ['list'], admin: ['access'] },
    user: { posts: ['create', 'read'] },
  },
})

export const superAdminRole = extendRole(permissions.ac, permissions.roles.admin, {
  users: ['list', 'ban'] as const,
})

// The framework builds a FRESH dialect (and pool) per @Transient resolution, inside
// each request's own I/O context — mandatory on workerd, where a pool opened in one
// request cannot be reused by another. In PRODUCTION, Hyperdrive fronts those pools
// and multiplexes the real server connections, so they never accumulate. These tests
// run on @cloudflare/vitest-pool-workers against a DIRECT Postgres with NO Hyperdrive,
// so a fresh pool per resolution would exhaust `max_connections` under parallel test
// files ("sorry, too many clients already").
//
// Drive the connection topology through the framework's own `createPoolFactory`
// (dogfooding the public API consumers use): passing DB_SHARED_POOL_ENV makes it
// memoize ONE pool per connection and make that pool's `end()` idempotent — the
// framework disconnects EVERY live client on shutdown and they all share this pool,
// so without idempotence the 2nd+ `pool.end()` would throw "Called end on pool more
// than once". Module-scoped so every app instance in a file shares the one pool;
// dev/staging/prod leave the flag unset → fresh-per-resolution.
let sharedTestPool: (() => Promise<Pool>) | undefined
// `config` is captured from the FIRST call only — `??=` memoizes the factory, so a later call with a
// different config (e.g. a different `connectionString`) is silently ignored. Every `compile()` in one
// file resolves the same miniflare env, so this holds today; keep it in mind if a test ever stands up
// two app instances with different DB URLs in one file.
function sharedTestPoolFor(config: PoolConfig): () => Promise<Pool> {
  return (sharedTestPool ??= createPoolFactory({ [DB_SHARED_POOL_ENV]: 'true' }, () => new Pool(config)))
}

@Module({
  imports: [
    DatabaseModule.forRootAsync({
      inject: [DI_TOKENS.CloudflareEnv],
      // Shared, single-ended pool — see `sharedTestPoolFor` above for why.
      useFactory: (env: StratalEnv) => ({
        default: 'main',
        connections: [
          {
            name: 'main',
            schema,
            dialect: () => new PostgresDialect({
              pool: sharedTestPoolFor({
                connectionString: env.DB.connectionString,
                types: customPgTypes,
                max: 1,
                idleTimeoutMillis: 1000,
              })
            }),
          },
        ],
      }),
    }),
    AuthModule.forRootAsync({
      inject: [DI_TOKENS.Database],
      useFactory: (db: DatabaseService) => createTestAuthOptions(db),
      accessControl: {
        ...permissions,
        roles: { ...permissions.roles, super_admin: superAdminRole },
      },
    }),
  ],
  controllers: [PublicController, UsersController, PostsController, AdminController],
  providers: [UserSeeder],
})
export class TestAppModule { }
