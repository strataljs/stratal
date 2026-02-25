/**
 * Locale Extraction Middleware
 *
 * Extracts locale from X-Locale header and sets it on RouterContext.
 * Validates against available locales from MessageLoaderService.
 */

import { inject } from 'tsyringe'
import { Transient } from '../../di/decorators'
import type { Middleware } from '../../router/middleware.interface'
import type { RouterContext } from '../../router/router-context'
import { I18N_TOKENS } from '../i18n.tokens'
import type { MessageLoaderService } from '../services/message-loader.service'

@Transient()
export class LocaleExtractionMiddleware implements Middleware {

  constructor(
    @inject(I18N_TOKENS.MessageLoader) private readonly loader: MessageLoaderService,
  ) {
  }

  async handle(ctx: RouterContext, next: () => Promise<void>): Promise<void> {
    const locale = this.extractLocale(ctx)
    ctx.setLocale(locale)
    await next()
  }

  /**
   * Extract and validate locale from X-Locale header
   */
  private extractLocale(ctx: RouterContext): string {
    const requestedLocale = ctx.header('x-locale')?.toLowerCase()

    if (requestedLocale && this.loader.isLocaleSupported(requestedLocale)) {
      return requestedLocale
    }

    return this.loader.getDefaultLocale()
  }
}
