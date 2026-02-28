import { ERROR_CODES } from '../../errors'
import { ApplicationError } from '../../errors'

/**
 * RequestScopeOperationNotAllowedError
 *
 * Thrown when attempting to call a method that is not allowed on the current container scope.
 * - `createRequestScope()` and `runInRequestScope()` can only be called on global containers
 * - `runWithContextStore()` can only be called on request-scoped containers
 */
export class RequestScopeOperationNotAllowedError extends ApplicationError {
  constructor(methodName: string) {
    super(
      'errors.requestScopeOperationNotAllowed',
      ERROR_CODES.SYSTEM.INFRASTRUCTURE_ERROR,
      { methodName }
    )
  }
}
