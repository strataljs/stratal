import { inject } from 'tsyringe'
import type { QueueBinding } from '../queue-binding'

/**
 * Inject a queue sender by binding name.
 *
 * The binding name matches the `binding` field declared under `queues.producers`
 * in `wrangler.jsonc` (e.g. `BACKGROUND_QUEUE`). Stratal looks the binding up
 * directly on the worker's `env`; the underlying Cloudflare queue can be any
 * env-specific name (e.g. `background-queue-dev`) without affecting code.
 *
 * @param binding - Queue binding identifier (typed against `StratalEnv`).
 * @returns Parameter decorator for constructor injection
 *
 * @example
 * ```typescript
 * constructor(
 *   @InjectQueue('NOTIFICATIONS_QUEUE') private queue: IQueueSender
 * ) {}
 *
 * await this.queue.dispatch({
 *   type: 'email.send',
 *   payload: { to: 'user@example.com', subject: 'Hello' }
 * })
 * ```
 *
 * @remarks
 * The binding must be registered via `QueueModule.registerQueue(binding)`
 * before injection. For module-internal bindings (e.g. EmailModule),
 * use `@inject(TOKEN)` with `useExisting` provider binding instead.
 */
export function InjectQueue(binding: QueueBinding): ParameterDecorator {
  return inject(binding)
}
