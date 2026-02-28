import { ApplicationError, ERROR_CODES } from '../../errors'

/**
 * Error thrown when a requested route is not found
 *
 * HTTP Status: 404 Not Found
 * Error Code: 4004
 */
export class RouteNotFoundError extends ApplicationError {
  constructor(path: string, method: string) {
    super(
      'errors.routeNotFound',
      ERROR_CODES.RESOURCE.ROUTE_NOT_FOUND,
      { path, method }
    )
  }
}
