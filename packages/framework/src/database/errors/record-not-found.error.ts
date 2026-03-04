import { ERROR_CODES } from 'stratal/errors'
import { DatabaseError } from './database-error'

/**
 * RecordNotFoundError
 *
 * Generic error thrown when a database record is not found.
 * This is typically thrown when a findUnique or findFirst operation
 * returns null, or when a required record doesn't exist.
 *
 * Services should catch this and optionally refine it to a more specific
 * domain error (e.g., NoteNotFoundError, UserNotFoundError).
 */
export class RecordNotFoundError extends DatabaseError {
  constructor(details?: string) {
    super('errors.databaseRecordNotFound', ERROR_CODES.DATABASE.RECORD_NOT_FOUND, {
      details,
    })
  }
}
