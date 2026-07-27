import { ORMError, ORMErrorReason } from '@zenstackhq/orm';
import { type ApplicationError, DatabaseError } from 'stratal/errors';
import { RecordNotFoundError } from './record-not-found.error';
import { UniqueConstraintError } from './unique-constraint.error';

export function fromZenStackError(error: unknown): ApplicationError {
  if (error instanceof ORMError) {
    switch (error.reason) {
      case ORMErrorReason.NOT_FOUND:
        return new RecordNotFoundError(error.model, error)
      case ORMErrorReason.DB_QUERY_ERROR:
        return parseDatabaseError(error)
      case ORMErrorReason.INVALID_INPUT:
        return new DatabaseError('Invalid database query', error)
      case ORMErrorReason.CONFIG_ERROR:
        return new DatabaseError('Database configuration error', error)
      case ORMErrorReason.NOT_SUPPORTED:
        return new DatabaseError('Operation not supported', error)
      case ORMErrorReason.INTERNAL_ERROR:
        return new DatabaseError('Database internal error', error)
      default:
        return new DatabaseError('Database error', error)
    }
  }
  return new DatabaseError('Database error', error)
}

function parseDatabaseError(error: ORMError): ApplicationError {
  const dbErrorCode = error.dbErrorCode as string | undefined
  if (dbErrorCode) {
    if (dbErrorCode === '23505') return new UniqueConstraintError([error.model ?? 'unknown'], error)
    if (dbErrorCode === '23503') return new DatabaseError(withCode('Foreign key constraint violation', dbErrorCode), error)
    if (dbErrorCode === '23502') return new DatabaseError(withCode('Required field is missing', dbErrorCode), error)
    if (dbErrorCode === '23514') return new DatabaseError(withCode('Database constraint violated', dbErrorCode), error)
    if (dbErrorCode === '42P01') return new DatabaseError(withCode('Table does not exist', dbErrorCode), error)
    if (dbErrorCode === '42703') return new DatabaseError(withCode('Column does not exist', dbErrorCode), error)
    if (dbErrorCode.startsWith('42')) return new DatabaseError(withCode('Database syntax or access error', dbErrorCode), error)
    if (dbErrorCode.startsWith('22')) return new DatabaseError(withCode('Invalid data value for column', dbErrorCode), error)
    if (dbErrorCode.startsWith('08')) return new DatabaseError(withCode('Database connection failed', dbErrorCode), error)
    if (dbErrorCode === '57014') return new DatabaseError(withCode('Database query timeout', dbErrorCode), error)
    if (dbErrorCode.startsWith('40')) return new DatabaseError(withCode('Transaction conflict or deadlock', dbErrorCode), error)
    if (dbErrorCode === '53300') return new DatabaseError(withCode('Too many database connections', dbErrorCode), error)
    return new DatabaseError(withCode('Database error', dbErrorCode), error)
  }
  return new DatabaseError('Database error', error)
}

/**
 * Append the raw SQLSTATE to a human message so an operator can tell distinct
 * failures apart in production logs. The 5-character SQLSTATE is a fixed
 * PostgreSQL error code (e.g. `22021`), not query text, values, or schema — it
 * carries no sensitive data, so it is safe to surface where the full driver
 * message and stack are deliberately withheld.
 */
function withCode(message: string, dbErrorCode: string): string {
  return `${message} [SQLSTATE ${dbErrorCode}]`
}
