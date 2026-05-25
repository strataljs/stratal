import { inject } from 'tsyringe'
import type { MessageLoaderService } from '../../i18n/services/message-loader.service'
import { I18N_TOKENS } from '../../i18n/i18n.tokens'
import { Command } from '../command'

export class I18nStatsCommand extends Command {
  static command = 'i18n:stats {--prefix= : Filter by namespace prefix}'
  static description = 'Show i18n translation coverage statistics'

  constructor(@inject(I18N_TOKENS.MessageLoader) private loader: MessageLoaderService) {
    super()
  }

  handle(): number | undefined {
    const prefix = this.string('prefix')
    const filterOptions = prefix ? { only: [prefix] as never[] } : undefined

    const enKeys = new Set(Object.keys(this.loader.getFilteredMessages('en', filterOptions)))

    if (enKeys.size === 0) {
      this.info('No message keys found')
      return 0
    }

    const locales = this.loader.getAvailableLocales()
    const rows: string[][] = []

    for (const locale of locales) {
      const localeKeys = new Set(Object.keys(this.loader.getFilteredMessages(locale, filterOptions)))
      const isBase = locale === 'en'

      let translated = 0
      for (const key of enKeys) {
        if (localeKeys.has(key)) translated++
      }

      const missing = enKeys.size - translated
      let extra = 0
      for (const key of localeKeys) {
        if (!enKeys.has(key)) extra++
      }

      const coverage = ((translated / enKeys.size) * 100).toFixed(1) + '%'

      rows.push([
        locale,
        String(enKeys.size),
        String(translated),
        String(missing),
        isBase ? '-' : String(extra),
        coverage,
      ])
    }

    this.table(['Locale', 'Keys', 'Translated', 'Missing', 'Extra', 'Coverage'], rows)
    return 0
  }
}
