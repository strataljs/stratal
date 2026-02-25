import { Transient } from '../di/decorators'
import { DI_TOKENS } from '../di/tokens'
import type { IQueueConsumer } from './queue-consumer'

/**
 * Consumer Registry
 *
 * Singleton service that holds all registered queue consumers indexed by message type.
 * Consumers declare the message types they handle, and this registry routes messages
 * to the appropriate consumers based on their types.
 *
 * **Message-Type Routing:**
 * - Consumers declare `messageTypes` array (e.g., `['email.send', 'email.batch.send']`)
 * - When a message arrives, consumers matching the message type are invoked
 * - A consumer can handle messages from ANY queue (routing is by type, not queue)
 * - Use `'*'` as a wildcard to handle all message types
 *
 * @example Consumer registration
 * ```typescript
 * // In consumer.ts
 * @Transient()
 * export class EmailConsumer implements IQueueConsumer {
 *   readonly messageTypes = ['email.send', 'email.batch.send']
 *   // ...
 * }
 *
 * // In module.ts
 * @Module({
 *   consumers: [EmailConsumer]
 * })
 *
 * // Application auto-registers via ConsumerRegistry
 * this.consumerRegistry.register(consumer)
 * ```
 */
@Transient(DI_TOKENS.ConsumerRegistry)
export class ConsumerRegistry {
  /** Map from message type to consumers handling that type */
  private consumersByType = new Map<string, IQueueConsumer[]>()

  /** Set of all registered consumers (for iteration) */
  private allConsumers = new Set<IQueueConsumer>()

  /**
   * Register a queue consumer
   *
   * Indexes the consumer by each of its declared message types.
   *
   * @param consumer - Queue consumer to register
   */
  register(consumer: IQueueConsumer): void {
    if (this.allConsumers.has(consumer)) {
      return // Already registered
    }

    this.allConsumers.add(consumer)

    for (const messageType of consumer.messageTypes) {
      const existing = this.consumersByType.get(messageType) ?? []
      existing.push(consumer)
      this.consumersByType.set(messageType, existing)
    }
  }

  /**
   * Get all consumers that can handle a specific message type
   *
   * Returns consumers that either:
   * - Explicitly declare the message type
   * - Use '*' wildcard to handle all types
   *
   * @param messageType - The message type to find consumers for
   * @returns Array of consumers that can handle this message type
   */
  getConsumers(messageType: string): IQueueConsumer[] {
    const exactMatch = this.consumersByType.get(messageType) ?? []
    const wildcardMatch = this.consumersByType.get('*') ?? []

    // Combine and dedupe
    const combined = new Set([...exactMatch, ...wildcardMatch])
    return Array.from(combined)
  }

  /**
   * Check if any consumers can handle a message type
   *
   * @param messageType - The message type to check
   * @returns true if at least one consumer can handle this type
   */
  hasConsumers(messageType: string): boolean {
    return this.getConsumers(messageType).length > 0
  }

  /**
   * Get all registered message types
   *
   * @returns Array of message types with registered consumers
   */
  getMessageTypes(): string[] {
    return Array.from(this.consumersByType.keys())
  }

  /**
   * Get all registered consumers
   *
   * @returns Array of all registered consumers
   */
  getAllConsumers(): IQueueConsumer[] {
    return Array.from(this.allConsumers)
  }
}
