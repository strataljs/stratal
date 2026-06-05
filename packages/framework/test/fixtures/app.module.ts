import { PostgresDialect } from '@zenstackhq/orm/dialects/postgres'
import { Pool } from 'pg'
import { type StratalEnv } from 'stratal'
import { DI_TOKENS } from 'stratal/di'
import { Module } from 'stratal/module'
import { createAccessControl } from '../../src/access-control/create-access-control'
import { extendRole } from '../../src/access-control/extend-role'
import { AuthModule } from '../../src/auth/auth.module'
import { customPgTypes } from '../../src/database/custom-pg-types'
import { DatabaseModule } from '../../src/database/database.module'
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
            dialect: () => new PostgresDialect({
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
