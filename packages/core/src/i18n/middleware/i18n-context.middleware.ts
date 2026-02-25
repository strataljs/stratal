/**
 * I18n Context Middleware
 *
 * Sets up AsyncLocalStorage context for Zod i18n validation.
 * Must run after LocaleExtractionMiddleware sets the locale.
 */

import { inject } from 'tsyringe'
import { Transient } from '../../di/decorators'
import type { Middleware } from '../../router/middleware.interface'
import type { RouterContext } from '../../router/router-context'
import { I18N_TOKENS } from '../i18n.tokens'
import type { I18nService } from '../services/i18n.service'
import { runWithErrorMapContext } from '../validation'

@Transient()
export class I18nContextMiddleware implements Middleware {
  constructor(
    @inject(I18N_TOKENS.I18nService) private readonly i18n: I18nService
  ) {}

  async handle(ctx: RouterContext, next: () => Promise<void>): Promise<void> {
    const locale = ctx.getLocale()

    await runWithErrorMapContext(
      {
        t: (key, params) => this.i18n.t(key, params as Record<string, string | number> | undefined),
        locale,
      },
      () => next()
    )
  }
}
