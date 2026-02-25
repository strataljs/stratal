/**
 * Translation Missing Error
 * Thrown when a translation key is missing from all locales
 *
 * HTTP Status: 500 Internal Server Error
 * Error Code: 9300
 */

import { ERROR_CODES } from '../../errors'
import { ApplicationError } from '../../infrastructure/error-handler'

export class TranslationMissingError extends ApplicationError {
  constructor(key: string, locale: string) {
    super(
      'errors.translationMissing',
      ERROR_CODES.I18N.TRANSLATION_MISSING,
      { key, locale }
    )
  }
}
