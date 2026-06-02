import { Singleton } from '../di/decorators'
import { DI_TOKENS } from '../di/tokens'
import type { Constructor } from '../types'
import type { IQueueConsumer } from './queue-consumer'

/** A registered consumer class together with the message types it handles. */
export interface ConsumerRegistration {
  consumerClass: Constructor<IQueueConsumer>
  messageTypes: string[]
}

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
@Singleton(DI_TOKENS.ConsumerRegistry)
export class ConsumerRegistry {
  /** Map from message type to consumer classes handling that type */
  private classesByType = new Map<string, Constructor<IQueueConsumer>[]>()

  /** All registrations (for iteration / listing) */
  private registrations: ConsumerRegistration[] = []

  /** Registered consumer classes (dedupe) */
  private registeredClasses = new Set<Constructor<IQueueConsumer>>()

  /**
   * Register a queue consumer class.
   *
   * Indexes the class by each of its declared message types. A fresh instance
   * is resolved per message from the request-scoped container at dispatch time —
   * consumers are never held as long-lived singletons, so they may safely inject
   * request-scoped providers (`@InjectQueue`, i18n, auth context, …).
   *
   * @param consumerClass - Queue consumer class to register
   * @param messageTypes - Message types the consumer handles
   */
  register(consumerClass: Constructor<IQueueConsumer>, messageTypes: string[]): void {
    if (this.registeredClasses.has(consumerClass)) {
      return // Already registered
    }

    this.registeredClasses.add(consumerClass)
    this.registrations.push({ consumerClass, messageTypes })

    for (const messageType of messageTypes) {
      const existing = this.classesByType.get(messageType) ?? []
      existing.push(consumerClass)
      this.classesByType.set(messageType, existing)
    }
  }

  /**
   * Get all consumer classes that can handle a specific message type.
   *
   * Returns classes that either declare the message type explicitly or use the
   * `'*'` wildcard. Callers resolve a fresh instance per message from the
   * request-scoped container.
   *
   * @param messageType - The message type to find consumers for
   * @returns Array of consumer classes that can handle this message type
   */
  getConsumerClasses(messageType: string): Constructor<IQueueConsumer>[] {
    const exactMatch = this.classesByType.get(messageType) ?? []
    const wildcardMatch = this.classesByType.get('*') ?? []

    // Combine and dedupe
    return Array.from(new Set([...exactMatch, ...wildcardMatch]))
  }

  /**
   * Check if any consumers can handle a message type
   *
   * @param messageType - The message type to check
   * @returns true if at least one consumer can handle this type
   */
  hasConsumers(messageType: string): boolean {
    return this.getConsumerClasses(messageType).length > 0
  }

  /**
   * Get all registered message types
   *
   * @returns Array of message types with registered consumers
   */
  getMessageTypes(): string[] {
    return Array.from(this.classesByType.keys())
  }

  /**
   * Get all consumer registrations (class + message types) for listing.
   */
  getRegistrations(): readonly ConsumerRegistration[] {
    return this.registrations
  }
}
