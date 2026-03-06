import { PostgresDialect } from '@zenstackhq/orm/dialects/postgres'
import { Pool } from 'pg'
import { type StratalEnv } from 'stratal'
import { DI_TOKENS } from 'stratal/di'
import { Module } from 'stratal/module'
import { AuthModule } from '../../src/auth/auth.module'
import { customPgTypes } from '../../src/database/custom-pg-types'
import { DatabaseModule } from '../../src/database/database.module'
import type { DatabaseService } from '../../src/database/database.service'
import { RbacModule } from '../../src/rbac/rbac.module'
import { schema } from '../zenstack/schema'
import { createTestAuthOptions } from './auth-options'
import { AdminController } from './controllers/admin.controller'
import { PostsController } from './controllers/posts.controller'
import { PublicController } from './controllers/public.controller'
import { UsersController } from './controllers/users.controller'
import { RBAC_MODEL } from './rbac-model'

@Module({
  imports: [
    DatabaseModule.forRootAsync({
      inject: [DI_TOKENS.CloudflareEnv],
      useFactory: (env: StratalEnv) => ({
        default: 'main',
        connections: [
          {
            name: 'main',
            schema,
            dialect: new PostgresDialect({
              pool: new Pool({
                connectionString: env.DB.connectionString,
                types: customPgTypes,
                max: 1,
                idleTimeoutMillis: 30000,
              })
            }),
          },
        ],
      }),
    }),
    AuthModule.withRootAsync({
      inject: [DI_TOKENS.Database],
      useFactory: (db: DatabaseService) =>
        createTestAuthOptions(db),
    }),
    RbacModule.forRoot({
      model: RBAC_MODEL,
      defaultPolicies: [
        ['admin', 'users:*', '.*'],
        ['admin', 'posts:*', '.*'],
        ['admin', 'admin:*', '.*'],
        ['user', 'posts:read', 'get'],
        ['user', 'posts:create', 'post'],
      ],
      roleHierarchy: [
        ['super_admin', 'admin'],
      ],
    }),
  ],
  controllers: [PublicController, UsersController, PostsController, AdminController],
})
export class TestAppModule { }
