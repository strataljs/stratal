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
 *   async send<T>(binding: string, message: QueueMessage<T>): Promise<void> {
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
   * - CloudflareQueueProvider: Looks up the binding on env and calls queue.send()
   * - SyncQueueProvider: Finds matching consumers and calls handle() directly
   *
   * @param binding - Queue binding identifier
   * @param message - Complete message with id and metadata
   */
  send<T>(binding: string, message: QueueMessage<T>): Promise<void>
}
