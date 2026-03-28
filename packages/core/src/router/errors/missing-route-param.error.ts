import { ApplicationError, ERROR_CODES } from '../../errors'

/**
 * Thrown when a required path or domain parameter is missing during URL generation.
 *
 * Error Code: 9012
 */
export class MissingRouteParamError extends ApplicationError {
  constructor(param: string, name: string, path: string) {
    super('errors.missingRouteParam', ERROR_CODES.ROUTER.MISSING_ROUTE_PARAM, {
      param,
      name,
      path,
    })
  }
}
