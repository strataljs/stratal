import { Module, QueueModule } from 'stratal'
import { NotificationsController } from './notifications.controller'
import { NotificationConsumer } from './notification.consumer'

@Module({
  imports: [QueueModule.registerQueue('notifications-queue')],
  controllers: [NotificationsController],
  consumers: [NotificationConsumer],
})
export class NotificationsModule {}
