import type { II18nService } from '../i18n/i18n.types';
import type { IQueueProvider } from './providers';
import type { QueueMessage } from './queue-consumer';
import type { DispatchMessage, IQueueSender } from './queue-sender.interface';

/**
 * Queue Sender
 *
 * Implementation of IQueueSender bound to a specific queue binding.
 * Created by QueueRegistry for each registered binding.
 *
 * Automatically enriches messages with:
 * - `id`: UUID generated via crypto.randomUUID()
 * - `metadata.locale`: Current locale from I18n context
 * - `metadata.idempotencyKey`: Deterministic SHA-256 hash of type + payload (if not provided)
 *
 * @example
 * ```typescript
 * // Created by QueueRegistry, not directly instantiated
 * const sender = registry.getQueue('NOTIFICATIONS_QUEUE')
 *
 * await sender.dispatch({
 *   type: 'email.send',
 *   payload: { to: 'user@example.com', subject: 'Hello' }
 * })
 * ```
 */
export class QueueSender implements IQueueSender {
  constructor(
    private readonly binding: string,
    private readonly provider: IQueueProvider,
    private readonly i18n: II18nService
  ) {}

  /**
   * Dispatch a message to this queue.
   *
   * @param message - Message to dispatch (without id)
   */
  async dispatch<T>(message: DispatchMessage<T>): Promise<void> {
    const metadata = { ...message.metadata }

    if (!metadata.locale) {
      const locale = this.i18n.getLocale()
      if (locale) {
        metadata.locale = locale
      }
    }

    metadata.idempotencyKey ??= await this.generateIdempotencyKey(message.type, message.payload);

    const fullMessage: QueueMessage<T> = {
      id: crypto.randomUUID(),
      ...message,
      metadata,
    }

    await this.provider.send(this.binding, fullMessage)
  }

  private async generateIdempotencyKey(type: string, payload: unknown): Promise<string> {
    const data = new TextEncoder().encode(JSON.stringify({ type, payload }))
    const hash = await crypto.subtle.digest('SHA-256', data)
    return `queue:${Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')}`
  }
}
