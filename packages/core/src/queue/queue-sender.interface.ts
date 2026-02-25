import type { QueueMessage } from './queue-consumer'

/**
 * Message input for queue dispatch (without auto-generated fields)
 *
 * When dispatching a message, the id and timestamp are auto-generated.
 * You only need to provide the type, payload, and optional metadata.
 */
export type DispatchMessage<T = unknown> = Omit<QueueMessage<T>, 'id' | 'timestamp'>

/**
 * Queue sender interface for dispatching messages to a queue.
 *
 * Each IQueueSender instance is bound to a specific queue name.
 * Messages are dispatched with auto-generated id, timestamp, and locale metadata.
 *
 * @example
 * ```typescript
 * // Injected via @InjectQueue or token binding
 * constructor(
 *   @InjectQueue('notifications-queue') private queue: IQueueSender
 * ) {}
 *
 * // Dispatch a message
 * await this.queue.dispatch({
 *   type: 'email.send',
 *   payload: {
 *     to: 'user@example.com',
 *     subject: 'Welcome',
 *     html: '<h1>Hello!</h1>'
 *   }
 * })
 * ```
 */
export interface IQueueSender {
  /**
   * Dispatch a message to this queue.
   *
   * Auto-adds:
   * - `id`: Unique message identifier (UUID)
   * - `timestamp`: Current timestamp in milliseconds
   * - `metadata.locale`: Current locale from i18n context
   *
   * @param message - Message to dispatch (without id/timestamp)
   */
  dispatch<T>(message: DispatchMessage<T>): Promise<void>
}
