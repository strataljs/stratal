import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMock, type DeepMocked } from '@stratal/testing/mocks'
import type { LoggerService } from '../../logger/services/logger.service'
import type { II18nService } from '../../i18n/i18n.types'
import type { StratalEnv } from '../../env'
import type { MessageKeys } from '../../i18n/i18n.types'
import type { ErrorCode } from '../error-codes'
import { ApplicationError } from '../application-error'
import { ERROR_CODES } from '../error-codes'
import { GlobalErrorHandler } from '../global-error-handler'

// Concrete test errors
class ValidationTestError extends ApplicationError {
  constructor(metadata?: Record<string, unknown>) {
    super('errors.validation' as MessageKeys, ERROR_CODES.VALIDATION.GENERIC, metadata)
  }
}

class DatabaseTestError extends ApplicationError {
  constructor() {
    super('errors.database' as MessageKeys, ERROR_CODES.DATABASE.GENERIC)
  }
}

class AuthTestError extends ApplicationError {
  constructor() {
    super('errors.auth' as MessageKeys, ERROR_CODES.AUTH.INVALID_CREDENTIALS)
  }
}

class BusinessTestError extends ApplicationError {
  constructor() {
    super('errors.business' as MessageKeys, 5000 as ErrorCode)
  }
}

class SystemTestError extends ApplicationError {
  constructor() {
    super('errors.system' as MessageKeys, ERROR_CODES.SYSTEM.INTERNAL_ERROR)
  }
}

describe('GlobalErrorHandler', () => {
  let handler: GlobalErrorHandler
  let mockLogger: DeepMocked<LoggerService>
  let mockI18n: DeepMocked<II18nService>
  let mockEnv: StratalEnv

  beforeEach(() => {
    vi.clearAllMocks()

    mockLogger = createMock<LoggerService>()
    mockI18n = createMock<II18nService>()
    mockI18n.t.mockImplementation((key: string) => `translated:${key}`)
    mockEnv = { ENVIRONMENT: 'production' } as StratalEnv

    handler = new GlobalErrorHandler(
      mockLogger as unknown as LoggerService,
      mockI18n as unknown as II18nService,
      mockEnv
    )
  })

  describe('handle(applicationError)', () => {
    it('should return ErrorResponse with translated message', () => {
      const error = new ValidationTestError()
      const response = handler.handle(error)

      expect(response.code).toBe(ERROR_CODES.VALIDATION.GENERIC)
      expect(response.message).toBe('translated:errors.validation')
      expect(response.timestamp).toBeDefined()
    })

    it('should log with correct severity based on error code', () => {
      // Validation (1000) → info
      handler.handle(new ValidationTestError())
      expect(mockLogger.info).toHaveBeenCalled()
    })
  })

  describe('handle(unexpectedError)', () => {
    it('should wrap in InternalError', () => {
      const error = new Error('unexpected')
      const response = handler.handle(error)

      expect(response.code).toBe(ERROR_CODES.SYSTEM.INTERNAL_ERROR)
    })

    it('should log as error', () => {
      handler.handle(new Error('unexpected'))

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[UnexpectedError]',
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'unexpected',
          }),
        })
      )
    })
  })

  describe('handle(stringError)', () => {
    it('should wrap string in InternalError', () => {
      const response = handler.handle('string error')

      expect(response.code).toBe(ERROR_CODES.SYSTEM.INTERNAL_ERROR)
      expect(response.message).toBe('translated:errors.internalError')
    })
  })

  describe('severity mapping', () => {
    it('should log validation error (code 1000) as info', () => {
      handler.handle(new ValidationTestError())
      expect(mockLogger.info).toHaveBeenCalled()
    })

    it('should log database error (code 2000) as error', () => {
      handler.handle(new DatabaseTestError())
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[ApplicationError]',
        expect.any(Object)
      )
    })

    it('should log auth error (code 3000) as warn', () => {
      handler.handle(new AuthTestError())
      expect(mockLogger.warn).toHaveBeenCalled()
    })

    it('should log business error (code 5000) as warn', () => {
      handler.handle(new BusinessTestError())
      expect(mockLogger.warn).toHaveBeenCalled()
    })

    it('should log system error (code 9000) as error', () => {
      handler.handle(new SystemTestError())
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[ApplicationError]',
        expect.any(Object)
      )
    })
  })

  describe('translation', () => {
    it('should call i18n.t(messageKey, metadata) for ApplicationError', () => {
      const error = new ValidationTestError({ field: 'email' })
      handler.handle(error)

      expect(mockI18n.t).toHaveBeenCalledWith(
        'errors.validation',
        { field: 'email' }
      )
    })
  })
})
