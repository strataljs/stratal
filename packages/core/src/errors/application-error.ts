import type { Environment, ErrorResponse } from './error-response'
import type { MessageKeys } from '../i18n'
import type { ErrorCode } from './error-codes'

/**
 * ApplicationError
 *
 * Abstract base class for all application errors.
 * This class should never be used directly - always extend it to create specific error types.
 *
 * Features:
 * - Type-safe error codes from ERROR_CODES registry
 * - Type-safe message keys from i18n module
 * - Localized message keys (translated by GlobalErrorHandler)
 * - Structured metadata for logging and interpolation
 * - Proper Error prototype chain
 * - Automatic timestamp generation
 * - Serialization for RPC transmission
 *
 * Message Localization:
 * - Each error class defines a message key (e.g., 'errors.userNotFound')
 * - Metadata provides interpolation parameters (e.g., { userId: '123' })
 * - GlobalErrorHandler translates the message key using I18nService before sending response
 * - This ensures errors are localized based on the user's locale (from X-Locale header)
 */
export abstract class ApplicationError extends Error {
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
   * @param messageKey - Type-safe i18n message key (e.g., 'errors.userNotFound')
   * @param code - Type-safe error code from ERROR_CODES registry
   * @param metadata - Optional data for logging and interpolation
   */
  constructor(
    messageKey: MessageKeys,
    code: ErrorCode,
    metadata?: Record<string, unknown>
  ) {
    // Pass message key as the Error message (will be replaced with translated message in GlobalErrorHandler)
    super(messageKey)

    // Maintains proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype)

    this.name = this.constructor.name
    this.code = code
    this.timestamp = new Date().toISOString()
    this.metadata = metadata

    // Capture stack trace, excluding constructor call from it
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- captureStackTrace is V8-specific, not always present
    if (Error.captureStackTrace) {
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
   * @param translatedMessage - Optional translated message (from GlobalErrorHandler)
   * @returns ErrorResponse object suitable for JSON serialization
   */
  toErrorResponse(env: Environment, translatedMessage?: string): ErrorResponse {
    return {
      code: this.code,
      message: translatedMessage ?? this.message, // Use translated message if provided, otherwise fallback to messageKey
      timestamp: this.timestamp,
      // Include filtered user-facing metadata in all environments
      metadata: ApplicationError.filterMetadata(this.metadata),
      // Stack trace only in development for debugging
      stack: env === 'development' ? this.stack : undefined,
    }
  }

  /**
   * JSON serialization (used by JSON.stringify)
   * Defaults to development mode for backward compatibility
   * Note: This will use the untranslated message key - use GlobalErrorHandler for proper localization
   */
  toJSON(): ErrorResponse {
    return this.toErrorResponse('development')
  }
}
