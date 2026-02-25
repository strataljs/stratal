/**
 * Locale Not Supported Error
 * Thrown when an unsupported locale is requested
 *
 * HTTP Status: 500 Internal Server Error
 * Error Code: 9301
 */

import { ERROR_CODES } from '../../errors'
import { ApplicationError } from '../../infrastructure/error-handler'

export class LocaleNotSupportedError extends ApplicationError {
  constructor(locale: string, supportedLocales: string[]) {
    super(
      'errors.localeNotSupported',
      ERROR_CODES.I18N.LOCALE_NOT_SUPPORTED,
      { locale, supportedLocales: supportedLocales.join(', ') }
    )
  }
}
