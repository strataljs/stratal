import { ApplicationError } from './application-error'
import { ERROR_CODES } from './error-codes'

/**
 * Thrown when attempting to access the application container via AsyncLocalStorage
 * before `Application.initialize()` has been called.
 *
 * This typically means `route()` or another standalone function is being called
 * outside the application lifecycle.
 */
export class ContainerNotInitializedError extends ApplicationError {
  constructor() {
    super(
      'errors.containerNotInitialized',
      ERROR_CODES.SYSTEM.CONTAINER_NOT_INITIALIZED
    )
  }
}
