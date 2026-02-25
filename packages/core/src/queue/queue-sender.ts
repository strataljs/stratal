import type { II18nService } from '../i18n/i18n.types'
import type { IQueueProvider } from './providers'
import type { QueueMessage } from './queue-consumer'
import type { DispatchMessage, IQueueSender } from './queue-sender.interface'

/**
 * Queue Sender
 *
 * Implementation of IQueueSender bound to a specific queue name.
 * Created by QueueRegistry for each registered queue.
 *
 * Automatically enriches messages with:
 * - `id`: UUID generated via crypto.randomUUID()
 * - `timestamp`: Current time in milliseconds
 * - `metadata.locale`: Current locale from I18n context
 *
 * @example
 * ```typescript
 * // Created by QueueRegistry, not directly instantiated
 * const sender = registry.getQueue('notifications-queue')
 *
 * await sender.dispatch({
 *   type: 'email.send',
 *   payload: { to: 'user@example.com', subject: 'Hello' }
 * })
 * ```
 */
export class QueueSender implements IQueueSender {
  constructor(
    private readonly queueName: string,
    private readonly provider: IQueueProvider,
    private readonly i18n: II18nService
  ) {}

  /**
   * Dispatch a message to this queue.
   *
   * @param message - Message to dispatch (without id/timestamp)
   */
  async dispatch<T>(message: DispatchMessage<T>): Promise<void> {
    const metadata = { ...message.metadata }

    if (!metadata.locale) {
      const locale = this.i18n.getLocale()
      if (locale) {
        metadata.locale = locale
      }
    }

    const fullMessage: QueueMessage<T> = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...message,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined
    }

    await this.provider.send(this.queueName, fullMessage)
  }
}
