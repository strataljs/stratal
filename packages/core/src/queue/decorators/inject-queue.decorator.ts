import { inject } from 'tsyringe'
import type { QueueName } from '../queue-name'

/**
 * Inject a queue sender by name.
 *
 * Queue names are typed via module augmentation of QueueNames interface.
 * The queue name serves as both the identifier and the DI injection token.
 *
 * @param name - Queue name (typed with autocomplete if QueueNames is augmented)
 * @returns Parameter decorator for constructor injection
 *
 * @example
 * ```typescript
 * // Direct injection by queue name
 * constructor(
 *   @InjectQueue('notifications-queue') private queue: IQueueSender
 * ) {}
 *
 * // Usage
 * await this.queue.dispatch({
 *   type: 'email.send',
 *   payload: { to: 'user@example.com', subject: 'Hello' }
 * })
 * ```
 *
 * @remarks
 * The queue must be registered via `QueueModule.registerQueue(name)` before injection.
 * For module-internal queue bindings (e.g., EmailModule), use `@inject(TOKEN)` with
 * `useExisting` provider binding instead.
 */
export function InjectQueue(name: QueueName): ParameterDecorator {
  return inject(name)
}
