/**
 * Translation Missing Error
 * Thrown when a translation key is missing from all locales
 */

import { I18nError } from '../i18n.error'

export class TranslationMissingError extends I18nError {
  constructor(key: string, locale: string) {
    super(`Translation missing for key "${key}" in locale "${locale}"`)
  }
}
