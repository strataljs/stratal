import { inject } from 'tsyringe'
import type { MessageLoaderService } from '../../i18n/services/message-loader.service'
import { I18N_TOKENS } from '../../i18n/i18n.tokens'
import { Command } from '../command'

export class I18nSearchCommand extends Command {
  static command = 'i18n:search {query : Search term (substring match)} {--locale= : Locale to search in (default: en)} {--keys-only : Only match key names, not values}'
  static description = 'Search for i18n message keys or values'

  constructor(@inject(I18N_TOKENS.MessageLoader) private loader: MessageLoaderService) {
    super()
  }

  handle(): number | undefined {
    const query = this.string('query').toLowerCase()
    const locale = this.string('locale') || 'en'
    const keysOnly = this.boolean('keys-only')

    const messages = this.loader.getFilteredMessages(locale)
    const matches: [string, string][] = []

    for (const [key, value] of Object.entries(messages)) {
      const keyMatch = key.toLowerCase().includes(query)
      const valueMatch = !keysOnly && value.toLowerCase().includes(query)

      if (keyMatch || valueMatch) {
        matches.push([key, value])
      }
    }

    if (matches.length === 0) {
      this.info(`No keys matching "${this.string('query')}" found`)
      return 0
    }

    matches.sort((a, b) => a[0].localeCompare(b[0]))
    this.table(['Key', 'Value'], matches)
    return 0
  }
}
