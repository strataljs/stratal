import type { MessageKeys } from 'stratal/i18n'
import { ApplicationError, ERROR_CODES, type ErrorCode } from 'stratal/errors'
import { InvalidErrorCodeRangeError } from './invalid-error-code-range.error'

/**
 * DatabaseError
 *
 * Generic database error thrown when a database operation fails
 * and doesn't fit into a more specific error category.
 *
 * This is the base class for all database-related errors.
 */
export class DatabaseError extends ApplicationError {
  constructor(
    messageKey: MessageKeys = 'errors.databaseGeneric',
    code: ErrorCode = ERROR_CODES.DATABASE.GENERIC,
    metadata?: Record<string, unknown>
  ) {
    // Validate that code is in the database error range
    if (code < 2000 || code >= 3000) {
      throw new InvalidErrorCodeRangeError(code, '2000-2999')
    }

    super(messageKey, code, metadata)
  }
}
