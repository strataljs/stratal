import { ERROR_CODES } from './error-codes'
import { ApplicationError } from './application-error'

/**
 * InternalError
 *
 * Represents an unexpected internal server error.
 * Used to wrap unknown errors that don't fit into specific error categories.
 *
 * This error is thrown when:
 * - An unexpected exception occurs
 * - An error type is not recognized
 * - A system-level failure happens
 */
export class InternalError extends ApplicationError {
  constructor(metadata?: Record<string, unknown>) {
    super(
      'errors.internalError',
      ERROR_CODES.SYSTEM.INTERNAL_ERROR,
      metadata
    )
  }
}
