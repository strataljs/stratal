import { ApplicationError, ERROR_CODES } from '../../errors'

/**
 * Thrown when attempting to generate a URL for a route name that doesn't exist in the registry.
 *
 * Error Code: 9011
 */
export class RouteNameNotFoundError extends ApplicationError {
  constructor(name: string) {
    super('errors.routeNameNotFound', ERROR_CODES.ROUTER.ROUTE_NAME_NOT_FOUND, {
      name,
    })
  }
}
