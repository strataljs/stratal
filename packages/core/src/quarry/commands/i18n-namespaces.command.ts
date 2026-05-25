import { inject } from 'tsyringe'
import type { MessageLoaderService } from '../../i18n/services/message-loader.service'
import { I18N_TOKENS } from '../../i18n/i18n.tokens'
import { Command } from '../command'
import { extractNamespace } from './i18n-utils'

export class I18nNamespacesCommand extends Command {
  static command = 'i18n:namespaces {--depth= : Namespace depth (default: 1)} {--locale= : Show counts for a specific locale}'
  static description = 'List i18n message namespaces with key counts'

  constructor(@inject(I18N_TOKENS.MessageLoader) private loader: MessageLoaderService) {
    super()
  }

  handle(): number | undefined {
    const depth = this.number('depth') || 1
    const localeFilter = this.string('locale')

    const locales = localeFilter
      ? [localeFilter]
      : this.loader.getAvailableLocales()

    const namespaceCounts = new Map<string, Map<string, number>>()

    for (const locale of locales) {
      const messages = this.loader.getFilteredMessages(locale)

      for (const key of Object.keys(messages)) {
        const ns = extractNamespace(key, depth)

        if (!namespaceCounts.has(ns)) {
          namespaceCounts.set(ns, new Map())
        }
        const counts = namespaceCounts.get(ns)!
        counts.set(locale, (counts.get(locale) ?? 0) + 1)
      }
    }

    if (namespaceCounts.size === 0) {
      this.info('No namespaces found')
      return 0
    }

    const sortedNamespaces = [...namespaceCounts.keys()].sort()
    const headers = ['Namespace', ...locales]
    const rows = sortedNamespaces.map((ns) => {
      const counts = namespaceCounts.get(ns)!
      return [ns, ...locales.map((locale) => String(counts.get(locale) ?? 0))]
    })

    this.table(headers, rows)
    return 0
  }
}
