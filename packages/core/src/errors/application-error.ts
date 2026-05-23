import type { MessageKeys } from '../i18n'
import type { ErrorCode } from './error-codes'

/**
 * ApplicationError
 *
 * Abstract base class for all application errors. Pure data carrier —
 * response shaping, reporting, and rendering are handled by ExceptionHandler.
 *
 * @deprecated Use {@link HttpException} for new error classes. `HttpException` provides
 * a simpler constructor that takes `(httpStatus, message?)` and derives the error code
 * automatically. Existing subclasses will continue to work but should be migrated over time.
 */
export abstract class ApplicationError extends Error {
  public readonly code: ErrorCode
  public readonly timestamp: string
  public readonly metadata?: Record<string, unknown>

  constructor(
    i18nKey: MessageKeys,
    code: ErrorCode,
    metadata?: Record<string, unknown>,
    cause?: unknown,
  ) {
    super(i18nKey, cause !== undefined ? { cause } : undefined)

    Object.setPrototypeOf(this, new.target.prototype)

    this.name = this.constructor.name
    this.code = code
    this.timestamp = new Date().toISOString()
    this.metadata = metadata

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- captureStackTrace is V8-specific, not always present
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }
}
