import { ERROR_CODES } from 'stratal/errors'
import { DatabaseError } from './database-error'

/**
 * UniqueConstraintError
 *
 * Thrown when a database unique constraint is violated.
 * This typically occurs when trying to insert or update a record
 * with a value that already exists in a unique column.
 *
 * Services should catch this and optionally refine it to a more specific
 * domain error (e.g., UserEmailAlreadyExistsError).
 */
export class UniqueConstraintError extends DatabaseError {
  constructor(fields?: string[]) {
    super('errors.databaseUniqueConstraint', ERROR_CODES.DATABASE.UNIQUE_CONSTRAINT, {
      fields,
    })
  }
}
