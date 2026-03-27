import { ApplicationError, ERROR_CODES } from '../../errors'
import type { ZodError } from '../../i18n/validation'
import { type z } from '../../i18n/validation'

/**
 * ResponseValidationError
 *
 * Thrown when a controller's response body does not match the declared Zod response schema.
 * Indicates a server-side schema mismatch — the controller is returning data that
 * violates its own API contract.
 */
export class ResponseValidationError extends ApplicationError {
  constructor(zodError: ZodError) {
    const issues = zodError.issues.map((err: z.core.$ZodIssue) => ({
      path: err.path.join('.'),
      message: err.message,
      code: err.code,
    }))

    super(
      'errors.responseValidation',
      ERROR_CODES.VALIDATION.RESPONSE_VALIDATION,
      { issues }
    )
  }
}
