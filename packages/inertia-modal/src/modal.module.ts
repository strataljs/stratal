import { I18nModule } from 'stratal/i18n'
import type { OnInitialize } from 'stratal/module'
import { Module } from 'stratal/module'
import { augmentRouterContextWithModal } from './augment/router-context'
import { modalMessages } from './i18n'
import { HonoBackgroundDispatcher } from './server/background'
import { ModalService } from './server/modal.service'
import { MODAL_TOKENS } from './tokens'

@Module({
  imports: [
    // The messages this package's errors are raised from. Unregistered, the
    // file is unreachable from every entry point, the bundler drops it, and each
    // error reaches the browser as the raw key it failed to translate. The
    // import also carries the translator into apps that never install i18n
    // themselves, which is what makes the English text the default rather than
    // something a consumer has to opt into.
    I18nModule.registerMessages({ en: { modal: modalMessages.en } }),
  ],
  providers: [
    { provide: MODAL_TOKENS.ModalService, useClass: ModalService },
    { provide: MODAL_TOKENS.BackgroundDispatcher, useClass: HonoBackgroundDispatcher },
  ],
})
export class ModalModule implements OnInitialize {
  onInitialize(): void {
    augmentRouterContextWithModal((ctx) => {
      return ctx.getContainer().resolve<ModalService>(MODAL_TOKENS.ModalService)
    })
  }
}
