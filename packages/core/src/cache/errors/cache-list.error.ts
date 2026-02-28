import { ERROR_CODES } from '../../errors'
import { ApplicationError } from '../../errors'

/**
 * Error thrown when a cache list operation fails
 *
 * Raw error details are logged via LoggerService for security.
 */
export class CacheListError extends ApplicationError {
  constructor() {
    super('errors.cache.listFailed', ERROR_CODES.SYSTEM.INFRASTRUCTURE_ERROR, {})
  }
}
