import { ApplicationError, ERROR_CODES } from '../../errors'

/**
 * QueueProviderNotSupportedError
 *
 * Thrown when attempting to use a queue provider that is not supported.
 * Valid providers are: 'cloudflare', 'sync'
 *
 * This typically indicates an invalid QUEUE_PROVIDER environment variable.
 */
export class QueueProviderNotSupportedError extends ApplicationError {
  constructor(provider: string) {
    super(
      'errors.queueProviderNotSupported',
      ERROR_CODES.SYSTEM.QUEUE_PROVIDER_NOT_SUPPORTED,
      { provider }
    )
  }
}
