import { describe, expect, it } from 'vitest'
import type { MessageKeys } from '../../i18n/i18n.types'
import type { ErrorCode } from '../error-codes'
import { ApplicationError } from '../application-error'
import { ERROR_CODES } from '../error-codes'

class TestError extends ApplicationError {
  constructor(
    messageKey: string,
    code: number,
    metadata?: Record<string, unknown>,
    cause?: unknown,
  ) {
    super(messageKey as MessageKeys, code as ErrorCode, metadata, cause)
  }
}

describe('ApplicationError', () => {
  describe('constructor', () => {
    it('should set code, message, timestamp, metadata, and name', () => {
      const metadata = { userId: '123' }
      const error = new TestError('errors.testError', ERROR_CODES.VALIDATION.GENERIC, metadata)

      expect(error.code).toBe(ERROR_CODES.VALIDATION.GENERIC)
      expect(error.message).toBe('errors.testError')
      expect(error.timestamp).toBeDefined()
      expect(error.metadata).toEqual({ userId: '123' })
      expect(error.name).toBe('TestError')
    })

    it('should generate a valid ISO timestamp', () => {
      const error = new TestError('errors.test', ERROR_CODES.VALIDATION.GENERIC)
      const parsed = new Date(error.timestamp)
      expect(parsed.getTime()).not.toBeNaN()
    })

    it('should always capture stack trace', () => {
      const error = new TestError('errors.test', ERROR_CODES.VALIDATION.GENERIC)
      expect(error.stack).toBeDefined()
      expect(error.stack).toContain('TestError')
    })
  })

  describe('prototype chain', () => {
    it('should be instanceof Error', () => {
      const error = new TestError('errors.test', ERROR_CODES.VALIDATION.GENERIC)
      expect(error instanceof Error).toBe(true)
    })

    it('should be instanceof ApplicationError', () => {
      const error = new TestError('errors.test', ERROR_CODES.VALIDATION.GENERIC)
      expect(error instanceof ApplicationError).toBe(true)
    })
  })

  describe('cause chain', () => {
    it('should leave cause undefined when no cause is provided', () => {
      const error = new TestError('errors.test', ERROR_CODES.VALIDATION.GENERIC)
      expect(error.cause).toBeUndefined()
    })

    it('should preserve a native Error as Error.cause', () => {
      const original = new Error('boom')
      const error = new TestError('errors.test', ERROR_CODES.VALIDATION.GENERIC, undefined, original)
      expect(error.cause).toBe(original)
    })

    it('should preserve nested ApplicationError causes through Error.cause', () => {
      const inner = new TestError('errors.inner', ERROR_CODES.VALIDATION.GENERIC)
      const outer = new TestError('errors.outer', ERROR_CODES.VALIDATION.GENERIC, undefined, inner)
      expect(outer.cause).toBe(inner)
      expect((outer.cause as TestError).message).toBe('errors.inner')
    })

    it('should preserve non-Error causes verbatim', () => {
      const error = new TestError('errors.test', ERROR_CODES.VALIDATION.GENERIC, undefined, { reason: 'config' })
      expect(error.cause).toEqual({ reason: 'config' })
    })
  })
})
