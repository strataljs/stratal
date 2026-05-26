import { inject } from '../../di'
import type { MessageLoaderService } from '../../i18n/services/message-loader.service'
import { I18N_TOKENS } from '../../i18n/i18n.tokens'
import { Command } from '../command'
import { computeKeyDiff } from './i18n-utils'

export class I18nCheckCommand extends Command {
  static command = 'i18n:check {--locale= : Check a specific locale only} {--prefix= : Filter by namespace prefix}'
  static description = 'Check i18n translations for missing or extra keys'

  constructor(@inject(I18N_TOKENS.MessageLoader) private loader: MessageLoaderService) {
    super()
  }

  handle(): number | undefined {
    const localeFilter = this.string('locale')
    const prefix = this.string('prefix')
    const filterOptions = prefix ? { only: [prefix] as never[] } : undefined

    const enKeys = new Set(Object.keys(this.loader.getFilteredMessages('en', filterOptions)))

    if (enKeys.size === 0) {
      this.info('No message keys found')
      return 0
    }

    const locales = this.loader.getAvailableLocales().filter((l) => l !== 'en')
    const targets = localeFilter ? locales.filter((l) => l === localeFilter) : locales

    if (targets.length === 0) {
      this.info(localeFilter ? `Locale "${localeFilter}" not found` : 'No non-en locales configured')
      return 0
    }

    let totalIssues = 0
    const summaryRows: string[][] = []

    for (const locale of targets) {
      const localeKeys = new Set(Object.keys(this.loader.getFilteredMessages(locale, filterOptions)))
      const { missing, extra } = computeKeyDiff(enKeys, localeKeys)

      this.newLine()
      this.info(`Locale: ${locale}`)

      if (missing.length > 0) {
        this.warn(`  Missing (${missing.length}):`)
        for (const key of missing) {
          this.line(`    ${key}`)
        }
      } else {
        this.line('  Missing (0)')
      }

      if (extra.length > 0) {
        this.warn(`  Extra (${extra.length}):`)
        for (const key of extra) {
          this.line(`    ${key}`)
        }
      } else {
        this.line('  Extra (0)')
      }

      totalIssues += missing.length + extra.length
      summaryRows.push([locale, String(enKeys.size), String(missing.length), String(extra.length)])
    }

    this.newLine()
    this.table(['Locale', 'Total', 'Missing', 'Extra'], summaryRows)

    if (totalIssues > 0) {
      this.newLine()
      this.fail(`${totalIssues} issue(s) found`)
      return undefined
    }

    this.newLine()
    this.success('All translations are complete')
    return 0
  }
}
