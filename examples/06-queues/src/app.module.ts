import { DI_TOKENS, Module, QueueModule, StratalEnv } from 'stratal'
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
