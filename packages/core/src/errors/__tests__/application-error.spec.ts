import { describe, expect, it } from 'vitest'
import type { MessageKeys } from '../../i18n/i18n.types'
import type { ErrorCode } from '../error-codes'
import { ApplicationError } from '../application-error'
import { ERROR_CODES } from '../error-codes'

// Concrete subclass for testing since ApplicationError is abstract
class TestError extends ApplicationError {
  constructor(messageKey: string, code: number, metadata?: Record<string, unknown>) {
    super(messageKey as MessageKeys, code as ErrorCode, metadata)
  }
}

describe('ApplicationError', () => {
  describe('constructor', () => {
    it('should set code, message (messageKey), timestamp, metadata, and name', () => {
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

  describe('toErrorResponse()', () => {
    it('should exclude stack in production and include code/message/timestamp', () => {
      const error = new TestError('errors.test', ERROR_CODES.VALIDATION.GENERIC)
      const response = error.toErrorResponse('production')

      expect(response.code).toBe(ERROR_CODES.VALIDATION.GENERIC)
      expect(response.message).toBe('errors.test')
      expect(response.timestamp).toBe(error.timestamp)
      expect(response.stack).toBeUndefined()
    })

    it('should include stack in development', () => {
      const error = new TestError('errors.test', ERROR_CODES.VALIDATION.GENERIC)
      const response = error.toErrorResponse('development')

      expect(response.stack).toBeDefined()
      expect(typeof response.stack).toBe('string')
    })

    it('should use translatedMessage when provided', () => {
      const error = new TestError('errors.test', ERROR_CODES.VALIDATION.GENERIC)
      const response = error.toErrorResponse('production', 'Translated message')

      expect(response.message).toBe('Translated message')
    })

    it('should fall back to messageKey when no translatedMessage', () => {
      const error = new TestError('errors.test', ERROR_CODES.VALIDATION.GENERIC)
      const response = error.toErrorResponse('production')

      expect(response.message).toBe('errors.test')
    })
  })

  describe('metadata filtering', () => {
    it('should pass through issues, fields, and field to response', () => {
      const error = new TestError('errors.test', ERROR_CODES.VALIDATION.GENERIC, {
        issues: [{ field: 'email', message: 'required' }],
        fields: ['email', 'name'],
        field: 'email',
      })
      const response = error.toErrorResponse('production')

      expect(response.metadata).toEqual({
        issues: [{ field: 'email', message: 'required' }],
        fields: ['email', 'name'],
        field: 'email',
      })
    })

    it('should exclude internal properties like path and method', () => {
      const error = new TestError('errors.test', ERROR_CODES.VALIDATION.GENERIC, {
        path: '/api/users',
        method: 'POST',
        controllerName: 'UsersController',
        reason: 'internal debug info',
      })
      const response = error.toErrorResponse('production')

      expect(response.metadata).toBeUndefined()
    })

    it('should return undefined metadata when no whitelisted properties', () => {
      const error = new TestError('errors.test', ERROR_CODES.VALIDATION.GENERIC, {
        internalOnly: 'data',
      })
      const response = error.toErrorResponse('production')

      expect(response.metadata).toBeUndefined()
    })

    it('should return undefined metadata when no metadata provided', () => {
      const error = new TestError('errors.test', ERROR_CODES.VALIDATION.GENERIC)
      const response = error.toErrorResponse('production')

      expect(response.metadata).toBeUndefined()
    })
  })

  describe('toJSON()', () => {
    it('should return development-mode response', () => {
      const error = new TestError('errors.test', ERROR_CODES.VALIDATION.GENERIC)
      const json = error.toJSON()

      expect(json.code).toBe(ERROR_CODES.VALIDATION.GENERIC)
      expect(json.message).toBe('errors.test')
      expect(json.stack).toBeDefined()
    })
  })
})
