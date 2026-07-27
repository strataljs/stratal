import { ORMError, ORMErrorReason } from '@zenstackhq/orm'
import { DatabaseError } from 'stratal/errors'
import { describe, expect, it } from 'vitest'
import { fromZenStackError } from '../from-zenstack-error'
import { UniqueConstraintError } from '../unique-constraint.error'

function dbQueryError(code?: string, message = 'pg driver failure'): ORMError {
  const err = new ORMError(ORMErrorReason.DB_QUERY_ERROR, message)
  if (code !== undefined) {
    err.dbErrorCode = code
  }
  return err
}

describe('fromZenStackError', () => {
  it('classifies a 22-class data exception and surfaces its SQLSTATE', () => {
    // 22021 = "invalid byte sequence for encoding UTF8" (e.g. a NUL byte).
    const result = fromZenStackError(dbQueryError('22021'))

    expect(result).toBeInstanceOf(DatabaseError)
    expect(result.message).toBe('Invalid data value for column [SQLSTATE 22021]')
  })

  it('keeps the SQLSTATE on the generic fallthrough for an unrecognised code', () => {
    const result = fromZenStackError(dbQueryError('XX000'))

    expect(result).toBeInstanceOf(DatabaseError)
    expect(result.message).toBe('Database error [SQLSTATE XX000]')
  })

  it('appends the SQLSTATE to already-mapped codes', () => {
    expect(fromZenStackError(dbQueryError('23503')).message)
      .toBe('Foreign key constraint violation [SQLSTATE 23503]')
    expect(fromZenStackError(dbQueryError('42703')).message)
      .toBe('Column does not exist [SQLSTATE 42703]')
  })

  it('still maps a unique violation to UniqueConstraintError', () => {
    expect(fromZenStackError(dbQueryError('23505'))).toBeInstanceOf(UniqueConstraintError)
  })

  it('retains the original ORMError as the cause for debugging', () => {
    const original = dbQueryError('22021')
    const result = fromZenStackError(original)

    expect((result as Error).cause).toBe(original)
  })

  it('emits a bare message when the driver gives no SQLSTATE', () => {
    expect(fromZenStackError(dbQueryError(undefined)).message).toBe('Database error')
  })

  it('wraps a non-ORM error as a generic database error', () => {
    expect(fromZenStackError(new Error('socket closed')).message).toBe('Database error')
  })
})
