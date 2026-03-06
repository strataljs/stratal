import type { StratalEnv } from 'stratal'
import { DI_TOKENS } from 'stratal/di'
import { Module } from 'stratal/module'
import { AuthModule as CoreAuthModule } from '@stratal/framework/auth'
import type { DatabaseService } from '@stratal/framework/database'
import { DatabaseModule } from '@stratal/framework/database'
import { RbacModule } from '@stratal/framework/rbac'

import { AuthModule } from './auth/auth.module'
import { createAuthOptions } from './auth/auth.config'
import { createDatabaseConfig } from './database/database.config'
import './database/database.types'
import { rbacConfig } from './rbac/rbac.config'
import { ArticlesModule } from './articles/articles.module'
import { ListenersModule } from './listeners/listeners.module'
import { RolesModule } from './roles/roles.module'

@Module({
  imports: [
    DatabaseModule.forRootAsync({
      inject: [DI_TOKENS.CloudflareEnv],
      useFactory: (env: StratalEnv) => createDatabaseConfig(env),
    }),
    CoreAuthModule.withRootAsync({
      inject: [DI_TOKENS.CloudflareEnv, DI_TOKENS.Database],
      useFactory: (env: StratalEnv, db: DatabaseService) => createAuthOptions(env, db),
    }),
    RbacModule.forRoot(rbacConfig),
    AuthModule,
    ListenersModule,
    ArticlesModule,
    RolesModule,
  ],
})
export class AppModule {}
