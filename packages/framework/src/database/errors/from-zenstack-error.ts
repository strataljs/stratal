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
    if (dbErrorCode === '23503') return new DatabaseError('Foreign key constraint violation', error)
    if (dbErrorCode === '23502') return new DatabaseError('Required field is missing', error)
    if (dbErrorCode === '23514') return new DatabaseError('Database constraint violated', error)
    if (dbErrorCode === '42P01') return new DatabaseError('Table does not exist', error)
    if (dbErrorCode === '42703') return new DatabaseError('Column does not exist', error)
    if (dbErrorCode.startsWith('42')) return new DatabaseError('Database syntax or access error', error)
    if (dbErrorCode.startsWith('08')) return new DatabaseError('Database connection failed', error)
    if (dbErrorCode === '57014') return new DatabaseError('Database query timeout', error)
    if (dbErrorCode.startsWith('40')) return new DatabaseError('Transaction conflict or deadlock', error)
    if (dbErrorCode === '53300') return new DatabaseError('Too many database connections', error)
  }
  return new DatabaseError('Database error', error)
}
