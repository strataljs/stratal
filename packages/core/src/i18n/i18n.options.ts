/**
 * I18n Module Options
 *
 * Configuration options for the I18n dynamic module.
 * Use with I18nModule.forRoot() to configure locale settings.
 * Use I18nModule.registerMessages() to add translations.
 */

/**
 * Options for configuring the I18n module
 *
 * @example
 * ```typescript
 * I18nModule.forRoot({
 *   defaultLocale: 'en',
 *   fallbackLocale: 'en',
 *   locales: ['en', 'fr'],
 * })
 *
 * I18nModule.registerMessages({
 *   en: { common: { hello: 'Hello' } },
 *   fr: { common: { hello: 'Bonjour' } },
 * })
 * ```
 */
export interface I18nModuleOptions {
  /**
   * Default locale for the application
   * Used when no locale is specified in request headers
   * @default 'en'
   */
  defaultLocale?: string

  /**
   * Fallback locale when translation is missing
   * @default 'en'
   */
  fallbackLocale?: string

  /**
   * List of supported locales
   * Request locales not in this list will fall back to defaultLocale
   */
  locales?: string[]
}

/**
 * Resolved options with all defaults applied
 * Used internally by I18n services
 */
export interface ResolvedI18nOptions {
  defaultLocale: string
  fallbackLocale: string
  locales: string[]
}

/**
 * Resolve I18n options with defaults
 */
export function resolveI18nOptions(options?: I18nModuleOptions): ResolvedI18nOptions {
  return {
    defaultLocale: options?.defaultLocale ?? 'en',
    fallbackLocale: options?.fallbackLocale ?? 'en',
    locales: options?.locales ?? ['en'],
  }
}
