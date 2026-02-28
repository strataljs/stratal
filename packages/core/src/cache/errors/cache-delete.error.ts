import { ERROR_CODES } from '../../errors'
import { ApplicationError } from '../../errors'

/**
 * Error thrown when a cache delete operation fails
 *
 * Raw error details are logged via LoggerService for security.
 * Only the key is included in the user-facing error message.
 */
export class CacheDeleteError extends ApplicationError {
  constructor(key: string) {
    super('errors.cache.deleteFailed', ERROR_CODES.SYSTEM.INFRASTRUCTURE_ERROR, { key })
  }
}
