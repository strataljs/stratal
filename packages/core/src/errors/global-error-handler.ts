import { inject } from 'tsyringe'
import { DI_TOKENS } from '../di'
import { Transient } from '../di/decorators'
import { type StratalEnv } from '../env'
import { I18N_TOKENS } from '../i18n/i18n.tokens'
import type { II18nService, MessageKeys } from '../i18n/i18n.types'
import { LOGGER_TOKENS, type LoggerService } from '../logger'
import { ApplicationError } from './application-error'
import type { Environment, ErrorResponse } from './error-response'
import { InternalError } from './internal-error'
import { isApplicationError } from './is-application-error'

/**
 * Log severity levels
 */
type LogSeverity = 'error' | 'warn' | 'info'

/**
 * GlobalErrorHandler
 *
 * Centralized error handler registered in the DI container.
 * Responsible for:
 * - Intercepting all errors in the application
 * - Logging errors with appropriate severity via Logger service
 * - Translating error message keys using I18nService (when available)
 * - Serializing errors for RPC transmission
 * - Wrapping unexpected errors in InternalError
 *
 * **Translation Availability by Context:**
 *
 * ✅ **HTTP Requests**: Errors are fully translated
 *    - GlobalErrorHandler resolved from request container
 *    - I18nService available via AsyncLocalStorage with user's locale
 *    - Full translation with parameter interpolation
 *
 * ✅ **Queue Processing**: Errors are fully translated
 *    - Error handling executes inside AsyncLocalStorage scope
 *    - Locale extracted from queue message metadata
 *    - Request container created with mock RouterContext
 *    - I18nService available with correct locale
 *
 * ⚠️ **RPC/Startup**: Message keys returned as-is (i18n unavailable)
 *    - No request context available during service binding or startup
 *    - No locale information available
 *    - Frontend can translate message keys using its own i18n if needed
 *    - This is expected behavior, not a bug
 *
 * **Implementation Note:**
 * The `isAvailable()` check exists to gracefully handle RPC/startup contexts
 * where no request container exists. For HTTP and Queue contexts, i18n is
 * always available thanks to AsyncLocalStorage scope propagation. This follows
 * the "Laravel philosophy" - transparent dependency injection for request contexts,
 * with explicit handling only for legitimate non-request edge cases.
 */
@Transient()
export class GlobalErrorHandler {
  private readonly environment: Environment
  constructor(
    @inject(LOGGER_TOKENS.LoggerService) private readonly logger: LoggerService,
    @inject(I18N_TOKENS.I18nService) private readonly i18n: II18nService,
    @inject(DI_TOKENS.CloudflareEnv)
    private readonly env: StratalEnv,
  ) {
    this.environment = this.env.ENVIRONMENT as Environment
  }

  /**
   * Handle an error, log it, and serialize for response
   *
   * @param error - The error to handle
   * @returns Serialized ErrorResponse for RPC transmission
   */
  handle(error: unknown): ErrorResponse {
    // Check if it's an ApplicationError
    if (isApplicationError(error)) {
      this.log(error)

      // Translate message
      // Works in: HTTP requests, Queue processing (i18n available via request container)
      // Falls back in: RPC/Startup (i18n might not be available)
      const translatedMessage = this.translateError(error)

      return error.toErrorResponse(this.environment, translatedMessage)
    }

    // Unexpected error - wrap in InternalError
    this.logUnexpectedError(error)

    const internalError = new InternalError({
      originalError: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    const translatedMessage = this.translateError(internalError)

    return internalError.toErrorResponse(this.environment, translatedMessage)
  }

  /**
   * Translate error message key using I18nService
   * Uses error metadata as interpolation parameters
   *
   * No try/catch - if translation fails, it's a bug that should fail loudly
   *
   * **Note**: This method is only called when isAvailable() returns true,
   * so the service is guaranteed to be resolved.
   *
   * @param error - ApplicationError with messageKey and metadata
   * @returns Translated message string
   */
  private translateError(error: ApplicationError): string {
    // Cast metadata to MessageParams (assuming values are string | number)
    const params = error.metadata as Record<string, string | number> | undefined
    return this.i18n.t(error.message as MessageKeys, params)
  }

  /**
   * Log an ApplicationError with appropriate severity
   */
  private log(error: ApplicationError): void {
    const severity = this.getSeverity(error.code)

    const logData = {
      code: error.code,
      message: this.translateError(error),
      timestamp: error.timestamp,
      metadata: error.metadata,
      name: error.name,
    }

    switch (severity) {
      case 'error':
        this.logger.error('[ApplicationError]', logData)
        break
      case 'warn':
        this.logger.warn('[ApplicationError]', logData)
        break
      case 'info':
        this.logger.info('[ApplicationError]', logData)
        break
    }
  }

  /**
   * Log an unexpected error
   */
  private logUnexpectedError(error: unknown): void {
    this.logger.error('[UnexpectedError]', {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : String(error),
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Determine log severity based on error code
   */
  private getSeverity(code: number): LogSeverity {
    // System errors (9000+) are critical
    if (code >= 9000) return 'error'

    // Database errors (2000-2999) are errors
    if (code >= 2000 && code < 3000) return 'error'

    // Business logic errors (5000-5999) are warnings
    if (code >= 5000 && code < 6000) return 'warn'

    // Validation errors (1000-1999) are info
    if (code >= 1000 && code < 2000) return 'info'

    // Auth/Resource errors (3000-4999) are warnings
    if (code >= 3000 && code < 5000) return 'warn'

    // Default to error
    return 'error'
  }
}
