/**
 * Message Loader Service
 *
 * Singleton service that loads and caches all locale messages at startup.
 * Merges core messages with registry messages (from registerMessages() calls).
 * Lazily builds and caches CoreContext per locale on first access.
 */

import type { CoreContext } from '@intlify/core-base'
import { createCoreContext } from '@intlify/core-base'
import { inject } from 'tsyringe'
import { Transient } from '../../di/decorators'
import type { I18nModuleOptions } from '../i18n.options'
import { I18N_TOKENS } from '../i18n.tokens'
import { getLocales, getMessages } from '../messages'
import { deepMerge } from '../utils/deep-merge'
import type { MessageRegistry } from './message-registry'

@Transient(I18N_TOKENS.MessageLoader)
export class MessageLoaderService {
  private readonly cache: Map<string, Record<string, unknown>>
  private readonly contextCache: Map<string, CoreContext>
  private readonly locales: string[]
  private readonly defaultLocale: string

  constructor(
    @inject(I18N_TOKENS.MessageRegistry) private readonly registry: MessageRegistry,
    @inject(I18N_TOKENS.Options, { isOptional: true })
    private readonly options?: I18nModuleOptions
  ) {
    this.defaultLocale = this.options?.defaultLocale ?? 'en'
    this.cache = new Map()
    this.contextCache = new Map()

    // Core messages (always available)
    const coreMessages = getMessages()
    const coreLocales = getLocales()

    // Registry messages (accumulated from all registerMessages() calls)
    const registryMessages = this.registry.getMergedMessages()
    const registryLocales = Object.keys(registryMessages)

    // Union of all locales
    const allLocales = [...new Set([...coreLocales, ...registryLocales])]
    this.locales = allLocales

    // Merge messages for each locale: core defaults + registry contributions
    for (const locale of allLocales) {
      const coreLocaleMessages = coreMessages[locale] ?? {}
      const registryLocaleMessages = registryMessages[locale] ?? {}

      const merged = deepMerge(coreLocaleMessages, registryLocaleMessages)
      this.cache.set(locale, merged)
    }
  }

  /**
   * Get CoreContext for a locale (lazily built and cached on first access)
   * Falls back to default locale if locale not found
   */
  getCoreContext(locale: string): CoreContext {
    const cached = this.contextCache.get(locale)
    if (cached) return cached

    const effectiveLocale = this.cache.has(locale) ? locale : this.defaultLocale

    const cachedEffective = this.contextCache.get(effectiveLocale)
    if (cachedEffective) return cachedEffective

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
   * Get messages for a specific locale.
   * Falls back to default locale if not found.
   */
  getMessages(locale: string): Record<string, unknown> {
    return this.cache.get(locale) ?? this.cache.get(this.defaultLocale) ?? {}
  }

  /** Get list of available locale codes */
  getAvailableLocales(): string[] {
    return this.locales
  }

  /** Check if a locale is supported */
  isLocaleSupported(locale: string): boolean {
    return this.cache.has(locale)
  }

  /** Get default locale */
  getDefaultLocale(): string {
    return this.defaultLocale
  }

  /**
   * Flatten nested messages to dot-notation.
   * e.g. `{ a: { b: 'hello' } }` → `{ 'a.b': 'hello' }`
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

}
