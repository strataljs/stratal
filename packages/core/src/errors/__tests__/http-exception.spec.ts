import { describe, expect, it } from 'vitest'
import type { MessageKeys } from '../../i18n/i18n.types'
import { ApplicationError } from '../application-error'
import { ERROR_CODES, type ErrorCode } from '../error-codes'
import { resolveHttpStatus, getHttpStatus } from '../get-http-status'
import { HttpException, abort } from '../http-exception'

describe('HttpException', () => {
  describe('constructor', () => {
    it('should set httpStatus and derive code from status', () => {
      const error = new HttpException(404, 'User not found')

      expect(error.httpStatus).toBe(404)
      expect(error.code).toBe(ERROR_CODES.RESOURCE.NOT_FOUND)
      expect(error.message).toBe('User not found')
      expect(error.name).toBe('HttpException')
    })

    it('should use default message when none provided', () => {
      const error = new HttpException(500)

      expect(error.httpStatus).toBe(500)
      expect(error.message).toBe('Internal Server Error')
    })

    it('should map common statuses to correct error codes', () => {
      expect(new HttpException(400).code).toBe(ERROR_CODES.VALIDATION.GENERIC)
      expect(new HttpException(401).code).toBe(ERROR_CODES.AUTH.USER_NOT_AUTHENTICATED)
      expect(new HttpException(403).code).toBe(ERROR_CODES.AUTHZ.FORBIDDEN)
      expect(new HttpException(404).code).toBe(ERROR_CODES.RESOURCE.NOT_FOUND)
      expect(new HttpException(409).code).toBe(ERROR_CODES.RESOURCE.CONFLICT)
      expect(new HttpException(422).code).toBe(ERROR_CODES.VALIDATION.GENERIC)
      expect(new HttpException(500).code).toBe(ERROR_CODES.SYSTEM.INTERNAL_ERROR)
    })

    it('should fallback to INTERNAL_ERROR for unmapped status codes', () => {
      const error = new HttpException(418 as never, "I'm a teapot")

      expect(error.httpStatus).toBe(418)
      expect(error.code).toBe(ERROR_CODES.SYSTEM.INTERNAL_ERROR)
    })

    it('should use default messages for common statuses', () => {
      expect(new HttpException(400).message).toBe('Bad Request')
      expect(new HttpException(401).message).toBe('Unauthorized')
      expect(new HttpException(403).message).toBe('Forbidden')
      expect(new HttpException(404).message).toBe('Not Found')
      expect(new HttpException(409).message).toBe('Conflict')
      expect(new HttpException(422).message).toBe('Unprocessable Entity')
      expect(new HttpException(500).message).toBe('Internal Server Error')
    })

    it('should accept an i18n-style key as message', () => {
      const error = new HttpException(422, 'errors.invalidInput')

      expect(error.message).toBe('errors.invalidInput')
    })
  })

  describe('subclassing', () => {
    class PaymentDeclinedError extends HttpException {
      constructor() {
        super(402, 'Payment was declined')
      }
    }

    it('should work as a base class', () => {
      const error = new PaymentDeclinedError()

      expect(error.httpStatus).toBe(402)
      expect(error.message).toBe('Payment was declined')
      expect(error.name).toBe('PaymentDeclinedError')
      expect(error).toBeInstanceOf(HttpException)
    })
  })

  describe('instanceof', () => {
    it('should be instanceof Error', () => {
      expect(new HttpException(500)).toBeInstanceOf(Error)
    })

    it('should be instanceof HttpException', () => {
      expect(new HttpException(500)).toBeInstanceOf(HttpException)
    })
  })
})

describe('abort', () => {
  it('should throw HttpException', () => {
    expect(() => abort(404)).toThrow(HttpException)
  })

  it('should set status and message', () => {
    try {
      abort(422, 'errors.invalidInput')
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException)
      const err = e as HttpException
      expect(err.httpStatus).toBe(422)
      expect(err.message).toBe('errors.invalidInput')
    }
  })

  it('should use default message when none provided', () => {
    try {
      abort(403)
      expect.unreachable()
    } catch (e) {
      const err = e as HttpException
      expect(err.message).toBe('Forbidden')
    }
  })
})

describe('resolveHttpStatus', () => {
  it('should prefer HttpException.httpStatus over code mapping', () => {
    const error = new HttpException(418 as never, 'Teapot')

    // Code maps to 500 (INTERNAL_ERROR), but httpStatus is 418
    expect(getHttpStatus(error.code)).toBe(500)
    expect(resolveHttpStatus(error)).toBe(418)
  })

  it('should fallback to getHttpStatus for non-HttpException errors', () => {
    class TestAppError extends ApplicationError {
      constructor() {
        super('errors.test' as MessageKeys, ERROR_CODES.RESOURCE.NOT_FOUND as ErrorCode)
      }
    }

    const error = new TestAppError()
    expect(resolveHttpStatus(error)).toBe(404)
  })
})
