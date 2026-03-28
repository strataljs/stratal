import { ApplicationError, ERROR_CODES } from '../../errors'

/**
 * Thrown when registering a named route that conflicts with an existing route name.
 *
 * Error Code: 9010
 */
export class DuplicateRouteNameError extends ApplicationError {
  constructor(name: string, existingHandler: string, newHandler: string) {
    super('errors.duplicateRouteName', ERROR_CODES.ROUTER.DUPLICATE_ROUTE_NAME, {
      name,
      existingHandler,
      newHandler,
    })
  }
}
