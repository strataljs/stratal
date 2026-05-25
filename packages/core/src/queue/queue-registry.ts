import { inject } from 'tsyringe'
import { Transient } from '../di/decorators'
import { I18N_TOKENS } from '../i18n/i18n.tokens'
import type { II18nService } from '../i18n/i18n.types'
import type { IQueueProvider } from './providers'
import type { IQueueSender } from './queue-sender.interface'
import { QueueSender } from './queue-sender'
import { QUEUE_TOKENS } from './queue.tokens'
import { type QueueProviderFactory } from './services'

/**
 * Queue Registry
 *
 * Request-scoped factory service for creating QueueSender instances.
 * Caches senders per binding within the request scope.
 *
 * This service is used internally by QueueModule.registerQueue() to provide
 * IQueueSender instances for each registered binding.
 *
 * **Why request-scoped?**
 * - Needs access to I18nService for locale-aware message metadata
 * - Provider is created once per request for consistency
 * - Queue senders are cached per request to avoid recreating them
 *
 * @example
 * ```typescript
 * // Used internally by QueueModule.registerQueue()
 * QueueModule.registerQueue('NOTIFICATIONS_QUEUE')
 *
 * // The module creates a factory provider:
 * {
 *   provide: 'NOTIFICATIONS_QUEUE',
 *   useFactory: (registry: QueueRegistry) => registry.getQueue('NOTIFICATIONS_QUEUE'),
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
   * Get or create a QueueSender for the specified binding.
   *
   * Senders are cached per binding within the request scope.
   *
   * @param binding - The queue binding to get a sender for
   * @returns QueueSender bound to the specified binding
   */
  getQueue(binding: string): IQueueSender {
    let sender = this.senders.get(binding)

    if (!sender) {
      sender = new QueueSender(binding, this.provider, this.i18n)
      this.senders.set(binding, sender)
    }

    return sender
  }
}
