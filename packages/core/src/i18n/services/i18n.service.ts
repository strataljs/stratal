/**
 * I18n Service
 *
 * Request-scoped service for translations.
 * Injects RouterContext to access request-specific locale.
 * Uses pre-built CoreContext from MessageLoaderService (singleton) for zero-cost lookups.
 */

import { translate } from '@intlify/core-base'
import { inject } from 'tsyringe'
import { Transient } from '../../di/decorators'
import { ROUTER_TOKENS, RouterContext } from '../../router'
import { I18N_TOKENS } from '../i18n.tokens'
import type { II18nService, MessageKeys, MessageParams } from '../i18n.types'
import type { MessageLoaderService } from './message-loader.service'

/**
 * I18n Service
 *
 * Provides internationalization (i18n) support for the application.
 * Injects RouterContext to access request-specific locale.
 *
 * @example Usage in services
 * ```typescript
 * @Transient(MY_TOKENS.UserService)
 * export class UserService {
 *   constructor(
 *     @inject(I18N_TOKENS.I18nService) private readonly i18n: II18nService
 *   ) {}
 *
 *   getWelcomeMessage(): string {
 *     return this.i18n.t('common.welcome')
 *   }
 * }
 * ```
 */
@Transient(I18N_TOKENS.I18nService)
export class I18nService implements II18nService {
  constructor(
    @inject(I18N_TOKENS.MessageLoader) private readonly loader: MessageLoaderService,
    @inject(ROUTER_TOKENS.RouterContext, { isOptional: true }) private readonly routerContext?: RouterContext
  ) {
  }

  /**
   * Translate a message key
   *
   * @param key - Message key (e.g., 'common.actions.save')
   * @param params - Optional parameters for interpolation
   * @returns Translated string
   */
  t(key: MessageKeys, params?: MessageParams): string {
    const context = this.loader.getCoreContext(this.getLocale())

    const result = params !== undefined
      ? translate(context, key, params)
      : translate(context, key)

    return typeof result === 'string' ? result : key
  }

  /**
   * Get current locale
   *
   * @returns Current locale code from RouterContext or default locale
   */
  getLocale(): string {
    return this.routerContext?.getLocale() ?? 'en'
  }
}
