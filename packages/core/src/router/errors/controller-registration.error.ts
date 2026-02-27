import { ApplicationError } from '../../infrastructure/error-handler'
import { ERROR_CODES } from '../../errors'

/**
 * Error thrown when a controller fails to register
 *
 * This typically happens when:
 * - Controller is missing the `@Controller` decorator
 * - Controller route metadata is not set
 * - Controller class name is invalid
 *
 * Error Code: 9005
 */
export class ControllerRegistrationError extends ApplicationError {
  constructor(controllerName: string, reason?: string) {
    super('errors.controllerRegistration', ERROR_CODES.ROUTER.CONTROLLER_REGISTRATION_ERROR, {
      controllerName,
      reason,
    })
  }
}
