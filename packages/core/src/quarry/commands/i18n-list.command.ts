import { inject } from 'tsyringe'
import type { MessageLoaderService } from '../../i18n/services/message-loader.service'
import { I18N_TOKENS } from '../../i18n/i18n.tokens'
import { Command } from '../command'

export class I18nListCommand extends Command {
  static command = 'i18n:list {--locale= : Show keys for a specific locale} {--prefix= : Filter by namespace prefix} {--values : Show translated values}'
  static description = 'List all i18n message keys'

  constructor(@inject(I18N_TOKENS.MessageLoader) private loader: MessageLoaderService) {
    super()
  }

  handle(): number | undefined {
    const localeFilter = this.string('locale')
    const prefix = this.string('prefix')
    const showValues = this.boolean('values')
    const filterOptions = prefix ? { only: [prefix] as never[] } : undefined

    const enMessages = this.loader.getFilteredMessages('en', filterOptions)
    const enKeys = Object.keys(enMessages).sort()

    if (enKeys.length === 0) {
      this.info('No message keys found')
      return 0
    }

    if (localeFilter && showValues) {
      const localeMessages = this.loader.getFilteredMessages(localeFilter, filterOptions)
      const rows = enKeys.map((key) => [key, localeMessages[key] ?? '-'])
      this.table(['Key', 'Value'], rows)
      return 0
    }

    const locales = localeFilter
      ? [localeFilter]
      : this.loader.getAvailableLocales()

    const localeMessages = new Map<string, Set<string>>()
    for (const locale of locales) {
      localeMessages.set(locale, new Set(Object.keys(this.loader.getFilteredMessages(locale, filterOptions))))
    }

    const headers = ['Key', ...locales]
    const rows = enKeys.map((key) => {
      const coverage = locales.map((locale) => (localeMessages.get(locale)!.has(key) ? 'Y' : 'N'))
      return [key, ...coverage]
    })

    this.table(headers, rows)
    return 0
  }
}
