import { ApplicationError, ERROR_CODES } from '../../errors'

/**
 * QueueBindingNotFoundError
 *
 * Thrown when attempting to access a Cloudflare Queue binding that isn't
 * configured on the worker's `env`. Typically indicates the binding is missing
 * from `wrangler.jsonc` under `queues.producers[].binding`.
 */
export class QueueBindingNotFoundError extends ApplicationError {
  constructor(binding: string) {
    super(
      'errors.queueBindingNotFound',
      ERROR_CODES.SYSTEM.QUEUE_BINDING_NOT_FOUND,
      { binding }
    )
  }
}
