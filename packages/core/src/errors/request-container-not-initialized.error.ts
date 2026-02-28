import { ApplicationError } from './application-error'
import { ERROR_CODES } from './error-codes'

/**
 * RequestContainerNotInitializedError
 *
 * Thrown when attempting to access the request-scoped container before it has been initialized.
 * This typically indicates that the RouterService middleware hasn't run yet,
 * or the router context is being accessed outside of a request lifecycle.
 */
export class RequestContainerNotInitializedError extends ApplicationError {
  constructor() {
    super(
      'errors.requestContainerNotInitialized',
      ERROR_CODES.SYSTEM.REQUEST_CONTAINER_NOT_INITIALIZED
    )
  }
}
