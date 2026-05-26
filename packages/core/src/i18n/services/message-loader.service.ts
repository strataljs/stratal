import MessageFormat from '@messageformat/core'
import { inject } from '../../di'
import { Singleton } from '../../di/decorators'
import type { I18nModuleOptions } from '../i18n.options'
import type { MessageKeyPrefix } from '../i18n.types'
import { I18N_TOKENS } from '../i18n.tokens'
import { getLocales, getMessages } from '../messages'
import { deepMerge } from '../utils/deep-merge'
import type { MessageRegistry } from './message-registry'

type CompiledMessages = Record<string, (params?: Record<string, unknown>) => string>

@Singleton(I18N_TOKENS.MessageLoader)
export class MessageLoaderService {
  private readonly cache: Map<string, Record<string, unknown>>
  private readonly compiledCache: Map<string, CompiledMessages>
  private readonly formatters: Map<string, MessageFormat>
  private readonly locales: string[]
  private readonly defaultLocale: string

  constructor(
    @inject(I18N_TOKENS.MessageRegistry) private readonly registry: MessageRegistry,
    @inject(I18N_TOKENS.Options, { isOptional: true })
    private readonly options?: I18nModuleOptions
  ) {
    this.defaultLocale = this.options?.defaultLocale ?? 'en'
    this.cache = new Map()
    this.compiledCache = new Map()
    this.formatters = new Map()

    const coreMessages = getMessages()
    const coreLocales = getLocales()

    const registryMessages = this.registry.getMergedMessages()
    const registryLocales = Object.keys(registryMessages)

    const allLocales = [...new Set([...coreLocales, ...registryLocales])]
    this.locales = allLocales

    for (const locale of allLocales) {
      const coreLocaleMessages = coreMessages[locale] ?? {}
      const registryLocaleMessages = registryMessages[locale] ?? {}

      const merged = deepMerge(coreLocaleMessages, registryLocaleMessages)
      this.cache.set(locale, merged)
      this.formatters.set(locale, new MessageFormat(locale))
    }
  }

  translate(locale: string, key: string, params?: Record<string, unknown>): string {
    const compiled = this.getCompiledMessages(locale)
    const fn = compiled[key]
    if (!fn) return key
    try {
      return fn(params)
    } catch {
      return key
    }
  }

  getMessages(locale: string): Record<string, unknown> {
    return this.cache.get(locale) ?? this.cache.get(this.defaultLocale) ?? {}
  }

  getAvailableLocales(): string[] {
    return this.locales
  }

  isLocaleSupported(locale: string): boolean {
    return this.cache.has(locale)
  }

  getDefaultLocale(): string {
    return this.defaultLocale
  }

  getFilteredMessages(
    locale: string,
    options?: { only?: MessageKeyPrefix[] }
  ): Record<string, string> {
    const messages = this.getMessages(locale)
    const flattened = this.flattenMessages(messages)

    if (!options?.only?.length) return flattened

    const result: Record<string, string> = {}
    for (const [key, value] of Object.entries(flattened)) {
      if (options.only.some((prefix) => key === prefix || key.startsWith(`${prefix}.`))) {
        result[key] = value
      }
    }
    return result
  }

  private getCompiledMessages(locale: string): CompiledMessages {
    const effectiveLocale = this.cache.has(locale) ? locale : this.defaultLocale

    const cached = this.compiledCache.get(effectiveLocale)
    if (cached) return cached

    const messages = this.cache.get(effectiveLocale) ?? {}
    const flattened = this.flattenMessages(messages)
    const mf = this.formatters.get(effectiveLocale) ?? new MessageFormat(effectiveLocale)

    const compiled: CompiledMessages = {}
    for (const [key, value] of Object.entries(flattened)) {
      try {
        compiled[key] = mf.compile(value) as (params?: Record<string, unknown>) => string
      } catch {
        compiled[key] = () => value
      }
    }

    this.compiledCache.set(effectiveLocale, compiled)
    return compiled
  }

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
