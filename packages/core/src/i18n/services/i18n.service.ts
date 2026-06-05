import { inject } from '../../di'
import { Request } from '../../di/decorators'
import { ROUTER_TOKENS, type RouterContext } from '../../router'
import { I18N_TOKENS } from '../i18n.tokens'
import type { II18nService, MessageKeys, MessageParams } from '../i18n.types'
import type { MessageLoaderService } from './message-loader.service'

@Request(I18N_TOKENS.I18nService)
export class I18nService implements II18nService {
  constructor(
    @inject(I18N_TOKENS.MessageLoader) private readonly loader: MessageLoaderService,
    @inject(ROUTER_TOKENS.RouterContext, { isOptional: true }) private readonly routerContext?: RouterContext
  ) {
  }

  t(key: MessageKeys, params?: MessageParams): string {
    return this.loader.translate(this.getLocale(), key, params as Record<string, unknown>)
  }

  getLocale(): string {
    return this.routerContext?.getLocale() ?? 'en'
  }
}
