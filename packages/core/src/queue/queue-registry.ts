import { inject } from 'tsyringe'
import { Transient } from '../di/decorators'
import { I18N_TOKENS } from '../i18n/i18n.tokens'
import type { II18nService } from '../i18n/i18n.types'
import type { IQueueProvider } from './providers'
import type { IQueueSender } from './queue-sender.interface'
import { QueueSender } from './queue-sender'
import { QUEUE_TOKENS } from './queue.tokens'
import { QueueProviderFactory } from './services'

/**
 * Queue Registry
 *
 * Request-scoped factory service for creating QueueSender instances.
 * Caches senders per queue name within the request scope.
 *
 * This service is used internally by QueueModule.registerQueue() to provide
 * IQueueSender instances for each registered queue.
 *
 * **Why request-scoped?**
 * - Needs access to I18nService for locale-aware message metadata
 * - Provider is created once per request for consistency
 * - Queue senders are cached per request to avoid recreating them
 *
 * @example
 * ```typescript
 * // Used internally by QueueModule.registerQueue()
 * QueueModule.registerQueue('notifications-queue')
 *
 * // The module creates a factory provider:
 * {
 *   provide: 'notifications-queue',
 *   useFactory: (registry: QueueRegistry) => registry.getQueue('notifications-queue'),
 *   inject: [QUEUE_TOKENS.QueueRegistry],
 * }
 * ```
 */
@Transient(QUEUE_TOKENS.QueueRegistry)
export class QueueRegistry {
  private readonly provider: IQueueProvider
  private readonly senders = new Map<string, IQueueSender>()

  constructor(
    @inject(QUEUE_TOKENS.QueueProviderFactory) providerFactory: QueueProviderFactory,
    @inject(I18N_TOKENS.I18nService) private readonly i18n: II18nService
  ) {
    this.provider = providerFactory.create()
  }

  /**
   * Get or create a QueueSender for the specified queue name.
   *
   * Senders are cached per queue name within the request scope.
   *
   * @param queueName - The queue name to get a sender for
   * @returns QueueSender bound to the specified queue
   */
  getQueue(queueName: string): IQueueSender {
    let sender = this.senders.get(queueName)

    if (!sender) {
      sender = new QueueSender(queueName, this.provider, this.i18n)
      this.senders.set(queueName, sender)
    }

    return sender
  }
}
