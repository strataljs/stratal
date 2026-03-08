import { DatabaseModule } from '@stratal/framework/database'
import type { StratalEnv } from 'stratal'
import { DI_TOKENS } from 'stratal/di'
import { Module } from 'stratal/module'

import { AnalyticsModule } from './analytics/analytics.module'
import { createDatabaseConfig } from './database/database.config'
import { ListenersModule } from './listeners/listeners.module'
import { UsersModule } from './users/users.module'

@Module({
  imports: [
    DatabaseModule.forRootAsync({
      inject: [DI_TOKENS.CloudflareEnv],
      useFactory: (env: StratalEnv) => createDatabaseConfig(env),
    }),
    UsersModule,
    AnalyticsModule,
    ListenersModule,
  ],
})
export class AppModule { }
