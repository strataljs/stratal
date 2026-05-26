import { inject } from '../../di'
import type { MessageLoaderService } from '../../i18n/services/message-loader.service'
import { I18N_TOKENS } from '../../i18n/i18n.tokens'
import { Command } from '../command'

export class I18nDuplicatesCommand extends Command {
  static command = 'i18n:duplicates {--locale= : Locale to check (default: en)} {--prefix= : Filter by namespace prefix}'
  static description = 'Find i18n keys with duplicate translation values'

  constructor(@inject(I18N_TOKENS.MessageLoader) private loader: MessageLoaderService) {
    super()
  }

  handle(): number | undefined {
    const locale = this.string('locale') || 'en'
    const prefix = this.string('prefix')
    const filterOptions = prefix ? { only: [prefix] as never[] } : undefined

    const messages = this.loader.getFilteredMessages(locale, filterOptions)
    const valueToKeys = new Map<string, string[]>()

    for (const [key, value] of Object.entries(messages)) {
      const existing = valueToKeys.get(value)
      if (existing) {
        existing.push(key)
      } else {
        valueToKeys.set(value, [key])
      }
    }

    const duplicates: [string, string][] = []
    for (const [value, keys] of valueToKeys) {
      if (keys.length > 1) {
        duplicates.push([value, keys.sort().join(', ')])
      }
    }

    if (duplicates.length === 0) {
      this.info('No duplicate values found')
      return 0
    }

    duplicates.sort((a, b) => a[0].localeCompare(b[0]))
    this.table(['Value', 'Keys'], duplicates)
    return 0
  }
}
