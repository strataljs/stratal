import { ApplicationError, ERROR_CODES } from '../../errors'

/**
 * ControllerMethodNotFoundError
 *
 * Thrown when a controller method is registered but doesn't exist on the controller instance.
 * This typically indicates a mismatch between route registration and controller implementation.
 */
export class ControllerMethodNotFoundError extends ApplicationError {
  constructor(methodName: string, controllerName: string) {
    super(
      'errors.controllerMethodNotFound',
      ERROR_CODES.ROUTER.CONTROLLER_METHOD_NOT_FOUND,
      { methodName, controllerName }
    )
  }
}
