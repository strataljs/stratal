import { ERROR_CODES } from 'stratal/errors'
import { DatabaseError } from './database-error'

/**
 * ForeignKeyConstraintError
 *
 * Thrown when a database foreign key constraint is violated.
 * This typically occurs when:
 * - Trying to insert a record with a foreign key that doesn't exist
 * - Trying to delete a record that is referenced by other records
 * - Trying to update a foreign key to a non-existent value
 */
export class ForeignKeyConstraintError extends DatabaseError {
  constructor(field?: string) {
    super('errors.databaseForeignKeyConstraint', ERROR_CODES.DATABASE.FOREIGN_KEY_CONSTRAINT, {
      field,
    })
  }
}
