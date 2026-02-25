import type { QueueMessage } from '../queue-consumer'

/**
 * Queue Provider Interface
 *
 * Defines the contract for queue providers. Each provider handles
 * the actual message delivery mechanism.
 *
 * **Available Providers:**
 * - `cloudflare`: Uses Cloudflare Queue bindings (production)
 * - `sync`: Processes messages immediately (testing/development)
 *
 * @example Implementing a custom provider
 * ```typescript
 * export class CustomQueueProvider implements IQueueProvider {
 *   async send<T>(queueName: string, message: QueueMessage<T>): Promise<void> {
 *     // Custom implementation
 *   }
 * }
 * ```
 */
export interface IQueueProvider {
  /**
   * Send a message to a queue
   *
   * Provider handles the actual delivery mechanism:
   * - CloudflareQueueProvider: Resolves CF binding and calls queue.send()
   * - SyncQueueProvider: Finds matching consumers and calls handle() directly
   *
   * @param queueName - Queue name
   * @param message - Complete message with id, timestamp, and metadata
   */
  send<T>(queueName: string, message: QueueMessage<T>): Promise<void>
}
