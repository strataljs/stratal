import { Transient } from 'stratal/di'
import { type IQueueConsumer, type QueueMessage } from 'stratal/queue'

interface NotificationPayload {
  to: string
  subject: string
  body: string
}

@Transient()
export class NotificationConsumer implements IQueueConsumer<NotificationPayload> {
  readonly messageTypes = ['notification.send']

  async handle(message: QueueMessage<NotificationPayload>) {
    const { to, subject, body } = message.payload
    console.log(`Sending notification to ${to}: [${subject}] ${body}`)

    return Promise.resolve();
  }

  async onError(error: Error, message: QueueMessage<NotificationPayload>) {
    console.error(`Failed to process notification ${message.id}:`, error)

    return Promise.resolve()
  }
}
