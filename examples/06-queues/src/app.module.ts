import { type StratalEnv } from 'stratal'
import { DI_TOKENS } from 'stratal/di'
import { Module } from 'stratal/module'
import { QueueModule } from 'stratal/queue'
import { NotificationsModule } from './notifications/notifications.module'

@Module({
  imports: [
    QueueModule.forRootAsync({
      inject: [DI_TOKENS.CloudflareEnv],
      useFactory: (env: StratalEnv) => ({
        provider: env.ENVIRONMENT === 'test' ? 'sync' : 'cloudflare',
      }),
    }),
    NotificationsModule,
  ],
})
export class AppModule {}
