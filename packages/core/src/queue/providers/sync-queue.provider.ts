import { inject } from 'tsyringe'
import { Transient } from '../../di/decorators'
import { DI_TOKENS } from '../../di/tokens'
import { ConsumerRegistry } from '../consumer-registry'
import type { QueueMessage } from '../queue-consumer'
import type { IQueueProvider } from './queue-provider.interface'

/**
 * Sync Queue Provider
 *
 * Processes messages immediately by finding matching consumers and calling
 * their handle() method directly. Used for testing and development where
 * real queue infrastructure is not available.
 *
 * **Behavior:**
 * - Messages are processed synchronously when send() is called
 * - Matching consumers are found via ConsumerRegistry by message type
 * - All matching consumers are called sequentially
 * - Errors are re-thrown after onError() is called (fail-fast for testing)
 *
 * **Consumer Matching:**
 * - Consumers are matched by message type, not queue name
 * - Wildcard ('*') matches all message types
 *
 * @example Testing with sync provider
 * ```typescript
 * const provider = new SyncQueueProvider(registry)
 * await provider.send('notifications-queue', {
 *   id: '123',
 *   timestamp: Date.now(),
 *   type: 'email.send',
 *   payload: { to: 'test@example.com' }
 * })
 * // Consumer's handle() is called immediately!
 * ```
 */
@Transient()
export class SyncQueueProvider implements IQueueProvider {
  constructor(
    @inject(DI_TOKENS.ConsumerRegistry) private readonly registry: ConsumerRegistry
  ) {}

  /**
   * Process a message synchronously
   *
   * Finds all matching consumers by message type and calls their handle() method.
   * If any consumer throws, onError() is called and the error is re-thrown.
   *
   * @param _queueName - Queue name (not used for routing, consumers match by message type)
   * @param message - Complete message with id, timestamp, and payload
   * @throws Re-throws any error from consumer.handle() after calling onError()
   */
  async send<T>(_queueName: string, message: QueueMessage<T>): Promise<void> {
    // Consumers are matched by message type, not queue name
    const consumers = this.registry.getConsumers(message.type)

    // Process synchronously - call each matching consumer
    for (const consumer of consumers) {
      try {
        await consumer.handle(message)
      } catch (error) {
        const errorInstance = error instanceof Error
          ? error
          : new Error(String(error))

        // Call onError hook if defined
        if (consumer.onError) {
          await consumer.onError(errorInstance, message)
        }

        // Re-throw for fail-fast behavior in tests
        throw errorInstance
      }
    }
  }
}
