import { inject } from 'tsyringe'
import { Transient } from '../di/decorators'
import { DI_TOKENS } from '../di/tokens'
import { type ConsumerRegistry } from './consumer-registry'
import type { QueueMessage } from './queue-consumer'

/**
 * Queue Manager
 *
 * Singleton service for processing queue message batches.
 * Routes messages to consumers based on message type.
 *
 * **Message Routing:**
 * - Consumers declare message types they handle (e.g., ['email.send'])
 * - When a message arrives, consumers matching the message type are invoked
 * - A consumer can handle messages from ANY queue (routing is by type, not queue)
 *
 * **Note:** For sending messages to queues, use IQueueSender instances
 * obtained via @InjectQueue('QUEUE_BINDING') or module bindings.
 *
 * @example Processing a queue batch
 * ```typescript
 * // In Cloudflare Worker queue handler
 * await queueManager.processBatch('notifications-queue', batch)
 * ```
 *
 * Note: the queue identifier passed here is the underlying Cloudflare queue
 * name (whatever wrangler routes to this worker), not a Stratal binding name.
 * It is informational only — Stratal routes messages to consumers by
 * `message.type`, not by the queue they arrived on.
 */
@Transient(DI_TOKENS.Queue)
export class QueueManager {
  constructor(
    @inject(DI_TOKENS.ConsumerRegistry) private readonly registry: ConsumerRegistry
  ) {}

  /**
   * Process a batch of queue messages
   *
   * Routes messages to registered consumers based on message type.
   * Uses ConsumerRegistry to find matching consumers.
   *
   * @param _queueName - Underlying Cloudflare queue name (for logging only)
   * @param batch - Batch of messages from Cloudflare Queue
   */
  async processBatch(_queueName: string, batch: MessageBatch): Promise<void> {
    for (const message of batch.messages) {
      const queueMessage = message.body as QueueMessage

      // Find consumers by message type (not by queue name)
      const consumers = this.registry.getConsumers(queueMessage.type)

      for (const consumer of consumers) {
        try {
          await consumer.handle(queueMessage)
          message.ack()
        } catch (error) {
          const errorInstance = error instanceof Error
            ? error
            : new Error(String(error))

          if (consumer.onError) {
            await consumer.onError(errorInstance, queueMessage)
          }
          message.retry()
        }
      }
    }
  }
}
