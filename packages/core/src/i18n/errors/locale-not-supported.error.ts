/**
 * Locale Not Supported Error
 * Thrown when an unsupported locale is requested
 */

import { I18nError } from '../i18n.error'

export class LocaleNotSupportedError extends I18nError {
  constructor(locale: string, supportedLocales: string[]) {
    super(`Locale "${locale}" is not supported. Supported locales: ${supportedLocales.join(', ')}`)
  }
}
