import { ApplicationError, ERROR_CODES } from '../../errors'

/**
 * OpenAPIValidationError
 *
 * Thrown when OpenAPI request/response validation fails
 * Uses i18n key for localized error messages
 *
 * HTTP Status: 400 Bad Request
 * Error Code: 1004
 *
 * @example
 * ```typescript
 * throw new OpenAPIValidationError('Request body missing required field: email')
 * ```
 */
export class OpenAPIValidationError extends ApplicationError {
  constructor(details: string) {
    super(
      'errors.openapiValidation',
      ERROR_CODES.VALIDATION.REQUEST_VALIDATION,
      { details }
    )
  }
}
