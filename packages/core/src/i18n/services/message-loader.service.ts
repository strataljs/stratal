/**
 * Message Loader Service
 *
 * Singleton service that loads and caches all locale messages at startup.
 * Merges core messages (from packages/modules) with app messages (from forRoot options).
 * Lazily builds and caches CoreContext per locale on first access.
 */

import type { CoreContext } from '@intlify/core-base'
import { createCoreContext } from '@intlify/core-base'
import { inject } from 'tsyringe'
import { Transient } from '../../di/decorators'
import type { I18nModuleOptions } from '../i18n.options'
import { I18N_TOKENS } from '../i18n.tokens'
import { getLocales, getMessages } from '../messages'

@Transient(I18N_TOKENS.MessageLoader)
export class MessageLoaderService {
  private readonly cache: Map<string, Record<string, unknown>>
  private readonly contextCache: Map<string, CoreContext>
  private readonly locales: string[]
  private readonly defaultLocale: string

  constructor(
    @inject(I18N_TOKENS.Options, { isOptional: true })
    private readonly options?: I18nModuleOptions
  ) {
    this.defaultLocale = this.options?.defaultLocale ?? 'en'
    this.cache = new Map()
    this.contextCache = new Map()

    // Get core messages (always available)
    const coreMessages = getMessages()
    const coreLocales = getLocales()

    // Get app messages from options (if provided)
    const appMessages = this.options?.messages ?? {}

    // Determine available locales (union of core and app locales)
    const appLocales = Object.keys(appMessages)
    const allLocales = [...new Set([...coreLocales, ...appLocales])]
    this.locales = allLocales

    // Merge messages for each locale (CoreContext built lazily on first access)
    for (const locale of allLocales) {
      const coreLocaleMessages = coreMessages[locale] ?? {}
      const appLocaleMessages = appMessages[locale] ?? {}

      // Deep merge: core defaults + app overrides
      const merged = this.deepMerge(coreLocaleMessages, appLocaleMessages)
      this.cache.set(locale, merged)
    }
  }

  /**
   * Get CoreContext for a locale (lazily built and cached on first access)
   * Falls back to default locale if locale not found
   *
   * @param locale - Locale code
   * @returns Cached CoreContext ready for translation
   */
  getCoreContext(locale: string): CoreContext {
    const cached = this.contextCache.get(locale)
    if (cached) return cached

    // Resolve effective locale (fallback to default if unsupported)
    const effectiveLocale = this.cache.has(locale) ? locale : this.defaultLocale

    // Check if effective locale already cached (handles fallback)
    const cachedEffective = this.contextCache.get(effectiveLocale)
    if (cachedEffective) return cachedEffective

    // Build and cache on first access
    const messages = this.cache.get(effectiveLocale) ?? {}
    const flattened = this.flattenMessages(messages)
    const ctx = createCoreContext({
      locale: effectiveLocale,
      messages: { [effectiveLocale]: flattened },
      missingWarn: false,
      fallbackWarn: false,
    })
    this.contextCache.set(effectiveLocale, ctx)
    return ctx
  }

  /**
   * Get messages for a specific locale
   * Falls back to default locale if locale not found
   *
   * @param locale - Locale code
   * @returns Message object for the locale
   */
  getMessages(locale: string): Record<string, unknown> {
    const msgs = this.cache.get(locale)
    if (!msgs) {
      // Fallback to default locale
      return this.cache.get(this.defaultLocale) ?? {}
    }
    return msgs
  }

  /**
   * Get list of available locale codes
   *
   * @returns Array of locale codes
   */
  getAvailableLocales(): string[] {
    return this.locales
  }

  /**
   * Check if a locale is supported
   *
   * @param locale - Locale code to check
   * @returns true if locale is supported
   */
  isLocaleSupported(locale: string): boolean {
    return this.cache.has(locale)
  }

  /**
   * Get default locale
   *
   * @returns Default locale code
   */
  getDefaultLocale(): string {
    return this.defaultLocale
  }

  /**
   * Flatten nested messages to dot-notation
   *
   * Converts { auth: { login: { title: 'Sign In' } } }
   * to { 'auth.login.title': 'Sign In' }
   */
  private flattenMessages(
    messages: Record<string, unknown>,
    prefix = ''
  ): Record<string, string> {
    const result: Record<string, string> = {}

    for (const key of Object.keys(messages)) {
      const value = messages[key]
      const newKey = prefix ? `${prefix}.${key}` : key

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        Object.assign(result, this.flattenMessages(value as Record<string, unknown>, newKey))
      } else {
        result[newKey] = String(value)
      }
    }

    return result
  }

  /**
   * Deep merge two objects
   * App messages override core messages at leaf level
   */
  private deepMerge(
    target: Record<string, unknown>,
    source: Record<string, unknown>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = { ...target }

    for (const key of Object.keys(source)) {
      const targetValue = target[key]
      const sourceValue = source[key]

      if (
        typeof targetValue === 'object' &&
        targetValue !== null &&
        !Array.isArray(targetValue) &&
        typeof sourceValue === 'object' &&
        sourceValue !== null &&
        !Array.isArray(sourceValue)
      ) {
        // Both are objects, deep merge
        result[key] = this.deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        )
      } else {
        // Source value overrides target
        result[key] = sourceValue
      }
    }

    return result
  }
}
