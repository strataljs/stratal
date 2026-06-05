import { getContainer } from '../di/container-storage'
import { I18N_TOKENS } from './i18n.tokens'
import type { II18nService, MessageKeys, MessageParams } from './i18n.types'

/**
 * Translate a message key using I18nService from the DI container.
 *
 * Works in both request scope (uses the request's detected locale) and
 * global scope (defaults to 'en'). Can be used anywhere — services,
 * middleware, error handlers, cron jobs, queue consumers, etc.
 *
 * @param key - Message key (e.g., 'common.welcome', 'errors.notFound')
 * @param params - Optional interpolation parameters
 * @returns Translated string, or the key itself if no container is available
 *
 * @example
 * ```typescript
 * import { withI18n } from 'stratal/i18n'
 *
 * const message = withI18n('errors.notFound')
 * const greeting = withI18n('common.welcome', { name: 'Alice' })
 * ```
 */
export function withI18n(key: MessageKeys, params?: MessageParams): string {
  try {
    const container = getContainer()
    const i18n = container.resolve<II18nService>(I18N_TOKENS.I18nService)
    return i18n.t(key, params)
  } catch {
    return key
  }
}
