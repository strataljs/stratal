import { ERROR_CODES } from '../../errors'
import { ApplicationError } from '../../infrastructure/error-handler'

/**
 * QueueBindingNotFoundError
 *
 * Thrown when attempting to access a Cloudflare Queue binding that hasn't been configured.
 * This typically indicates that the queue binding is missing from wrangler.jsonc
 * or the environment variables are not properly set.
 */
export class QueueBindingNotFoundError extends ApplicationError {
  constructor(queueName: string, bindingName: string) {
    super(
      'errors.queueBindingNotFound',
      ERROR_CODES.SYSTEM.QUEUE_BINDING_NOT_FOUND,
      { queueName, bindingName }
    )
  }
}
