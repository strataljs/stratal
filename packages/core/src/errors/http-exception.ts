import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { MessageKeys } from '../i18n'
import { ApplicationError } from './application-error'
import { ERROR_CODES, type ErrorCode } from './error-codes'

/**
 * Maps common HTTP status codes to their default error codes.
 * Used by {@link HttpException} to derive the error code automatically.
 */
const HTTP_STATUS_TO_ERROR_CODE: Partial<Record<number, ErrorCode>> = {
  400: ERROR_CODES.VALIDATION.GENERIC,
  401: ERROR_CODES.AUTH.USER_NOT_AUTHENTICATED,
  403: ERROR_CODES.AUTHZ.FORBIDDEN,
  404: ERROR_CODES.RESOURCE.NOT_FOUND,
  409: ERROR_CODES.RESOURCE.CONFLICT,
  422: ERROR_CODES.VALIDATION.GENERIC,
  429: ERROR_CODES.RESOURCE.TOO_MANY_REQUESTS,
  500: ERROR_CODES.SYSTEM.INTERNAL_ERROR,
}

/**
 * Default human-readable messages for common HTTP status codes.
 * Used as fallback when no message is provided to {@link HttpException}.
 */
const HTTP_STATUS_MESSAGES: Partial<Record<number, string>> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
}

/**
 * HTTP-centric exception base class.
 *
 * Unlike {@link ApplicationError} which requires `(i18nKey, code, metadata)`,
 * `HttpException` takes just `(httpStatus, message?)` and derives the error code
 * from the HTTP status automatically.
 *
 * The message can be a plain string or an i18n key — the {@link ExceptionHandler}
 * tries to translate it via `i18n.t()`, falling back to the raw string if the
 * key is not found.
 *
 * Existing {@link ApplicationError} subclasses can be migrated to this gradually.
 *
 * @example
 * ```typescript
 * // Simple usage with plain message
 * throw new HttpException(404, 'User not found')
 *
 * // With i18n key (auto-translated if key exists)
 * throw new HttpException(422, 'errors.invalidInput')
 *
 * // Default message for status code
 * throw new HttpException(500)
 *
 * // Subclass for domain-specific errors
 * class PaymentDeclinedError extends HttpException {
 *   constructor() {
 *     super(402, 'errors.paymentDeclined')
 *   }
 * }
 * ```
 */
export class HttpException extends ApplicationError {
  /**
   * The HTTP status code for this exception.
   * Used by the {@link ExceptionHandler} to set the response status.
   */
  public readonly httpStatus: ContentfulStatusCode

  /**
   * @param httpStatus - HTTP status code (e.g., 404, 422, 500)
   * @param message - Optional message string or i18n key. Defaults to the
   *   standard HTTP status message (e.g., "Not Found" for 404).
   */
  constructor(httpStatus: ContentfulStatusCode, message?: string) {
    const code = HTTP_STATUS_TO_ERROR_CODE[httpStatus] ?? ERROR_CODES.SYSTEM.INTERNAL_ERROR
    const messageStr = message ?? HTTP_STATUS_MESSAGES[httpStatus] ?? 'Internal Server Error'
    // Cast to MessageKeys for ApplicationError compat — ExceptionHandler will
    // attempt i18n.t() translation and fall back to the raw string
    super(messageStr as MessageKeys, code)
    this.httpStatus = httpStatus
  }
}

/**
 * Throw an HTTP exception from anywhere in the application.
 *
 * The message can be a plain string or an i18n key — the {@link ExceptionHandler}
 * translates it automatically, falling back to the raw string if the key is not found.
 *
 * @param status - HTTP status code
 * @param message - Optional message (plain string or i18n key)
 * @throws {@link HttpException} — always throws, never returns
 *
 * @example
 * ```typescript
 * // With plain message
 * abort(404, 'User not found')
 *
 * // Default message for status
 * abort(403)
 *
 * // With i18n key
 * abort(422, 'errors.invalidInput')
 * ```
 */
export function abort(
  status: ContentfulStatusCode,
  message?: MessageKeys | string & {},
): never {
  throw new HttpException(status, message)
}
