import { ERROR_CODES } from '../../errors'
import { ApplicationError } from '../../infrastructure/error-handler'

/**
 * OpenAPIRouteRegistrationError
 *
 * Thrown when an OpenAPI route fails to register properly
 * This indicates a configuration issue with route decorators or metadata
 * Uses i18n key for localized error messages
 *
 * @example
 * ```typescript
 * throw new OpenAPIRouteRegistrationError('/api/v1/users', 'Missing response schema')
 * ```
 */
export class OpenAPIRouteRegistrationError extends ApplicationError {
  constructor(path: string, reason: string) {
    super(
      'errors.openapiRouteRegistration',
      ERROR_CODES.ROUTER.OPENAPI_ROUTE_REGISTRATION,
      { path, reason }
    )
  }
}
