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
 * Sends messages to Cloudflare Queues by resolving the binding directly on
 * the worker's `env`. Used in production environments where Cloudflare Workers
 * handle queue processing.
 *
 * @example
 * ```typescript
 * const provider = new CloudflareQueueProvider(env)
 * await provider.send('NOTIFICATIONS_QUEUE', message)
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
   * @param binding - Queue binding identifier (e.g., 'NOTIFICATIONS_QUEUE')
   * @param message - Complete message with id, timestamp, and payload
   * @throws {QueueBindingNotFoundError} If the binding is not configured on env
   */
  async send<T>(binding: string, message: QueueMessage<T>): Promise<void> {
    const queue = (this.env as unknown as Record<string, unknown>)[binding] as Queue | undefined

    if (!queue) {
      throw new QueueBindingNotFoundError(binding)
    }

    await queue.send(message)
  }
}
