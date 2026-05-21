import type { Environment, ErrorResponse } from './error-response'
import type { ExceptionContext } from './exception-context'
import type { MessageKeys } from '../i18n'
import type { ErrorCode } from './error-codes'

/**
 * ApplicationError
 *
 * Abstract base class for all application errors.
 *
 * @deprecated Use {@link HttpException} for new error classes. `HttpException` provides
 * a simpler constructor that takes `(httpStatus, message?)` and derives the error code
 * automatically. Existing subclasses will continue to work but should be migrated over time.
 *
 * Features:
 * - Type-safe error codes from ERROR_CODES registry
 * - Type-safe message keys from i18n module
 * - Localized message keys (translated by ExceptionHandler)
 * - Structured metadata for logging and interpolation
 * - Proper Error prototype chain
 * - Automatic timestamp generation
 * - Serialization for RPC transmission
 * - Optional self-reporting via `report()` method
 * - Optional self-rendering via `render()` method
 *
 * Message Localization:
 * - Each error class passes an i18n key (e.g., 'errors.userNotFound') to super()
 * - `Error.message` contains the i18n key for useful stack traces and fallback display
 * - Metadata provides interpolation parameters (e.g., { userId: '123' })
 * - ExceptionHandler translates the message key using I18nService before sending response
 * - This ensures errors are localized based on the user's locale
 */
export abstract class ApplicationError extends Error {
  /**
   * Controls whether stack traces are captured.
   * Set to false in production to skip the expensive Error.captureStackTrace() call,
   * since stack traces are stripped from responses in production anyway.
   */
  static captureStackTraces = true

  /**
   * Type-safe error code from ERROR_CODES registry
   * See error-codes.ts for the complete registry
   */
  public readonly code: ErrorCode

  /**
   * ISO timestamp when the error was created
   */
  public readonly timestamp: string

  /**
   * Additional structured data about the error
   * Used for:
   * 1. Logging and debugging
   * 2. Message interpolation (e.g., { userId: '123', email: 'user@example.com' })
   */
  public readonly metadata?: Record<string, unknown>

  /**
   * @param i18nKey - Type-safe i18n message key (e.g., 'errors.userNotFound')
   * @param code - Type-safe error code from ERROR_CODES registry
   * @param metadata - Optional data for logging and interpolation
   * @param cause - Optional underlying error preserved as native `Error.cause`.
   *   When set, the original error (message, stack, code, metadata) survives
   *   through wrappers and is walked by `LoggerService.serializeError`.
   */
  constructor(
    i18nKey: MessageKeys,
    code: ErrorCode,
    metadata?: Record<string, unknown>,
    cause?: unknown,
  ) {
    // Pass i18nKey to Error.message for useful stack traces (e.g., "InternalError: errors.internalError").
    // Forward `cause` via the ES2022 Error options bag so `error.cause` is populated natively.
    super(i18nKey, cause !== undefined ? { cause } : undefined)

    // Maintains proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype)

    this.name = this.constructor.name
    this.code = code
    this.timestamp = new Date().toISOString()
    this.metadata = metadata

    // Capture stack trace, excluding constructor call from it
    // Skip in production where stack traces are stripped from responses anyway
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- captureStackTrace is V8-specific, not always present
    if (ApplicationError.captureStackTraces && Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }

  /**
   * Filter metadata to include only user-facing properties
   *
   * User-facing properties (validation/constraint errors):
   * - issues: Validation errors from SchemaValidationError
   * - fields: Constraint violation fields
   * - field: Single field constraint/foreign key
   *
   * Internal properties (excluded from response):
   * - path, method: Route debugging
   * - controllerName, reason: Controller errors
   * - details, etc.: Internal debugging info
   *
   * @param metadata - Raw metadata object
   * @returns Filtered metadata with only whitelisted properties
   */
  private static filterMetadata(
    metadata?: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    if (!metadata) return undefined

    // Whitelist of user-facing metadata properties
    const whitelist = ['issues', 'fields', 'field']

    const filtered: Record<string, unknown> = {}
    let hasUserFacingData = false

    for (const key of whitelist) {
      if (key in metadata && metadata[key] !== undefined) {
        filtered[key] = metadata[key]
        hasUserFacingData = true
      }
    }

    // Only return metadata if there's actual user-facing data
    return hasUserFacingData ? filtered : undefined
  }

  /**
   * Serialize error to ErrorResponse format for RPC transmission
   *
   * @param env - Environment (development | production)
   * @param translatedMessage - Optional translated message (from ExceptionHandler)
   * @returns ErrorResponse object suitable for JSON serialization
   */
  toErrorResponse(env: Environment, translatedMessage?: string): ErrorResponse {
    const message = translatedMessage ?? this.message

    return {
      code: this.code,
      message,
      timestamp: this.timestamp,
      // Include filtered user-facing metadata in all environments
      metadata: ApplicationError.filterMetadata(this.metadata),
      // Stack trace only in development for debugging
      // Rewrite first line with translated message for readable debugging
      stack: env === 'development'
        ? this.stack?.replace(this.message, message)
        : undefined,
    }
  }

  /**
   * JSON serialization (used by JSON.stringify)
   * Defaults to development mode for backward compatibility
   * Note: This will use the untranslated message key - use ExceptionHandler for proper localization
   */
  toJSON(): ErrorResponse {
    return this.toErrorResponse('development')
  }

  /**
   * Self-reporting hook. Override in subclasses to define custom reporting logic
   * that runs instead of the default logger.
   *
   * - Return `void` (or nothing) to **skip** default reporting after this runs.
   * - Return `false` to **also run** default reporting after this runs.
   *
   * @example
   * ```typescript
   * class PaymentError extends HttpException {
   *   report(): void {
   *     sentry.captureException(this)
   *     // Default logging is skipped
   *   }
   * }
   *
   * class SoftError extends HttpException {
   *   report(): false {
   *     analytics.track(this)
   *     return false // Default logging also runs
   *   }
   * }
   * ```
   */
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  report?(): void | false

  /**
   * Self-rendering hook. Override in subclasses to define how this error
   * is rendered into a Response.
   *
   * Return `undefined` to fall through to the default renderer.
   *
   * @param ctx - The execution context (narrow via `ctx.type` for HTTP helpers)
   * @returns A Response, ErrorResponse, or undefined to use default rendering
   *
   * @example
   * ```typescript
   * class MaintenanceError extends HttpException {
   *   render(ctx: ExceptionContext): Response | undefined {
   *     if (ctx.type === 'http') {
   *       return ctx.ctx.html('<h1>Down for maintenance</h1>', 503)
   *     }
   *   }
   * }
   * ```
   */
  render?(ctx: ExceptionContext): Response | ErrorResponse | undefined
}
