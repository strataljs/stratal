import { ORMError, ORMErrorReason } from '@zenstackhq/orm'
import { ERROR_CODES } from 'stratal/errors'
import { DatabaseError } from './database-error'
import { ForeignKeyConstraintError } from './foreign-key-constraint.error'
import { RecordNotFoundError } from './record-not-found.error'
import { UniqueConstraintError } from './unique-constraint.error'

/**
 * Transform ZenStack ORM errors into ApplicationError instances
 *
 * This function maps ORMError codes to generic database error classes.
 * Services can catch these generic errors and optionally refine them to
 * more specific domain errors if needed.
 *
 * @param error - The error thrown by ZenStack ORM
 * @returns An ApplicationError instance
 *
 * @example
 * ```typescript
 * try {
 *   await db.user.create({ data: { email: 'existing@example.com' } })
 * } catch (error) {
 *   throw fromZenStackError(error) // Becomes UniqueConstraintError or other
 * }
 * ```
 */
export function fromZenStackError(error: unknown): DatabaseError {
  // Handle ZenStack ORM Errors
  if (error instanceof ORMError) {
    const ormError = error

    switch (ormError.reason) {
      case ORMErrorReason.NOT_FOUND:
        return new RecordNotFoundError(ormError.model)

      case ORMErrorReason.DB_QUERY_ERROR:
        // Parse database-specific error codes
        return parseDatabaseError(ormError)

      case ORMErrorReason.INVALID_INPUT:
        return new DatabaseError(
          'errors.databaseInvalidQuery',
          ERROR_CODES.DATABASE.GENERIC,
          { message: ormError.message }
        )

      case ORMErrorReason.CONFIG_ERROR:
        return new DatabaseError(
          'errors.databaseConnectionFailed',
          ERROR_CODES.DATABASE.CONNECTION_FAILED,
          { message: ormError.message }
        )

      case ORMErrorReason.NOT_SUPPORTED:
        return new DatabaseError(
          'errors.databaseGeneric',
          ERROR_CODES.DATABASE.GENERIC,
          { message: ormError.message, reason: 'Operation not supported' }
        )

      case ORMErrorReason.INTERNAL_ERROR:
        return new DatabaseError(
          'errors.databaseGeneric',
          ERROR_CODES.DATABASE.GENERIC,
          { message: ormError.message }
        )

      default:
        return new DatabaseError(
          'errors.databaseGeneric',
          ERROR_CODES.DATABASE.GENERIC,
          { message: ormError.message, reason: ormError.reason }
        )
    }
  }

  // Handle unknown errors
  return new DatabaseError(
    'errors.databaseGeneric',
    ERROR_CODES.DATABASE.GENERIC,
    { originalError: String(error) }
  )
}

/**
 * Parse database-specific errors from the dbErrorCode field
 */
function parseDatabaseError(error: ORMError): DatabaseError {
  // Cast dbErrorCode to string since ZenStack types it loosely
  const dbErrorCode = error.dbErrorCode as string | undefined

  // PostgreSQL error codes
  // https://www.postgresql.org/docs/current/errcodes-appendix.html
  if (dbErrorCode) {
    // Class 23 - Integrity Constraint Violation
    if (dbErrorCode === '23505') {
      // Unique violation
      return new UniqueConstraintError([error.model ?? 'unknown'])
    }

    if (dbErrorCode === '23503') {
      // Foreign key violation
      return new ForeignKeyConstraintError(error.model ?? 'unknown')
    }

    if (dbErrorCode === '23502') {
      // Not null violation
      return new DatabaseError(
        'errors.databaseNullConstraint',
        ERROR_CODES.DATABASE.NULL_CONSTRAINT,
        { dbErrorCode, message: error.dbErrorMessage }
      )
    }

    if (dbErrorCode === '23514') {
      // Check constraint violation
      return new DatabaseError(
        'errors.databaseConstraintFailed',
        ERROR_CODES.DATABASE.GENERIC,
        { dbErrorCode, message: error.dbErrorMessage }
      )
    }

    // Class 42 - Syntax Error or Access Rule Violation
    if (dbErrorCode.startsWith('42')) {
      if (dbErrorCode === '42P01') {
        // Undefined table
        return new DatabaseError(
          'errors.databaseTableNotFound',
          ERROR_CODES.DATABASE.GENERIC,
          { dbErrorCode, message: error.dbErrorMessage }
        )
      }

      if (dbErrorCode === '42703') {
        // Undefined column
        return new DatabaseError(
          'errors.databaseColumnNotFound',
          ERROR_CODES.DATABASE.GENERIC,
          { dbErrorCode, message: error.dbErrorMessage }
        )
      }
    }

    // Class 08 - Connection Exception
    if (dbErrorCode.startsWith('08')) {
      return new DatabaseError(
        'errors.databaseConnectionFailed',
        ERROR_CODES.DATABASE.CONNECTION_FAILED,
        { dbErrorCode, message: error.dbErrorMessage }
      )
    }

    // Class 57 - Operator Intervention
    if (dbErrorCode === '57014') {
      // Query cancelled
      return new DatabaseError(
        'errors.databaseTimeout',
        ERROR_CODES.DATABASE.TIMEOUT,
        { dbErrorCode, message: error.dbErrorMessage }
      )
    }

    // Class 40 - Transaction Rollback
    if (dbErrorCode.startsWith('40')) {
      return new DatabaseError(
        'errors.databaseTransactionConflict',
        ERROR_CODES.DATABASE.TRANSACTION_CONFLICT,
        { dbErrorCode, message: error.dbErrorMessage }
      )
    }

    // Class 53 - Insufficient Resources
    if (dbErrorCode === '53300') {
      // Too many connections
      return new DatabaseError(
        'errors.databaseTooManyConnections',
        ERROR_CODES.DATABASE.TOO_MANY_CONNECTIONS,
        { dbErrorCode, message: error.dbErrorMessage }
      )
    }
  }

  // Default database error
  return new DatabaseError(
    'errors.databaseGeneric',
    ERROR_CODES.DATABASE.GENERIC,
    {
      dbErrorCode,
      dbErrorMessage: error.dbErrorMessage,
      sql: error.sql,
    }
  )
}
