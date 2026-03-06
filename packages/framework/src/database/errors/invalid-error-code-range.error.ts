import { ApplicationError, ERROR_CODES } from 'stratal/errors'

/**
 * InvalidErrorCodeRangeError
 *
 * Thrown when a DatabaseError subclass is constructed with an error code
 * outside the valid database error range (2000-2999).
 * This is a developer-facing error to enforce error code conventions.
 */
export class InvalidErrorCodeRangeError extends ApplicationError {
  constructor(code: number, expectedRange: string) {
    super(
      'errors.invalidErrorCodeRange',
      ERROR_CODES.SYSTEM.INVALID_ERROR_CODE_RANGE,
      { code, expectedRange }
    )
  }
}
