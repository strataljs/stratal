import type { StratalEnv } from 'stratal'
import { DI_TOKENS } from 'stratal/di'
import { Module } from 'stratal/module'
import { DatabaseModule } from '@stratal/framework/database'

import { createDatabaseConfig } from './database/database.config'
import './database/database.types'
import { ListenersModule } from './listeners/listeners.module'
import { TasksModule } from './tasks/tasks.module'

@Module({
  imports: [
    DatabaseModule.forRootAsync({
      inject: [DI_TOKENS.CloudflareEnv],
      useFactory: (env: StratalEnv) => createDatabaseConfig(env),
    }),
    TasksModule,
    ListenersModule,
  ],
})
export class AppModule {}
