import { inject } from 'tsyringe'
import { type StratalEnv } from '../../env'
import { Transient } from '../../di/decorators'
import { DI_TOKENS } from '../../di/tokens'
import { QueueBindingNotFoundError } from '../errors'
import type { QueueMessage } from '../queue-consumer'
import type { IQueueProvider } from './queue-provider.interface'

/**
 * Cloudflare Queue Provider
 *
 * Sends messages to Cloudflare Queues by resolving bindings from the environment.
 * Used in production environments where Cloudflare Workers handle queue processing.
 *
 * **Binding Resolution:**
 * Queue names are converted to binding names:
 * - `notifications-queue` → `NOTIFICATIONS_QUEUE`
 *
 * @example
 * ```typescript
 * const provider = new CloudflareQueueProvider(env)
 * await provider.send('notifications-queue', message)
 * ```
 */
@Transient()
export class CloudflareQueueProvider implements IQueueProvider {
  constructor(
    @inject(DI_TOKENS.CloudflareEnv) private readonly env: StratalEnv
  ) { }

  /**
   * Send a message to a Cloudflare Queue
   *
   * @param queueName - Queue name (e.g., 'notifications-queue')
   * @param message - Complete message with id, timestamp, and payload
   * @throws {QueueBindingNotFoundError} If queue binding is not configured
   */
  async send<T>(queueName: string, message: QueueMessage<T>): Promise<void> {
    const queue = this.getQueue(queueName)
    await queue.send(message)
  }

  /**
   * Resolve queue binding from Cloudflare environment
   *
   * Converts kebab-case queue name to UPPER_SNAKE_CASE binding name.
   *
   * @param queueName - Queue name (e.g., 'notifications-queue')
   * @returns Cloudflare Queue binding
   * @throws {QueueBindingNotFoundError} If binding not found in env
   */
  private getQueue(queueName: string): Queue {
    const bindingName = queueName.toUpperCase().replace(/-/g, '_')
    const queue = (this.env as unknown as Record<string, unknown>)[bindingName] as Queue | undefined

    if (!queue) {
      throw new QueueBindingNotFoundError(queueName, bindingName)
    }

    return queue
  }
}
