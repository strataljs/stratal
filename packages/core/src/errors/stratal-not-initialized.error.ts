import { ApplicationError } from './application-error'
import { ERROR_CODES } from './error-codes'

/**
 * StratalNotInitializedError
 *
 * Thrown when attempting to resolve the Application instance before Stratal has been instantiated.
 * This typically indicates that the Stratal instance is not exported as the default export.
 */
export class StratalNotInitializedError extends ApplicationError {
  constructor() {
    super(
      'errors.stratalNotInitialized',
      ERROR_CODES.SYSTEM.INFRASTRUCTURE_ERROR
    )
  }
}
