import { I18nModule } from 'stratal/i18n'
import type { OnInitialize } from 'stratal/module'
import { Module } from 'stratal/module'
import { augmentRouterContextWithModal } from './augment/router-context'
import { i18nMessages } from './i18n/index'
import { ModalService } from './services/modal.service'
import { MODAL_TOKENS } from './tokens'

@Module({
  imports: [I18nModule.registerMessages(i18nMessages)],
  providers: [
    { provide: MODAL_TOKENS.ModalService, useClass: ModalService },
  ],
})
export class ModalModule implements OnInitialize {
  onInitialize(): void {
    augmentRouterContextWithModal((ctx) => {
      return ctx.getContainer().resolve<ModalService>(MODAL_TOKENS.ModalService)
    })
  }
}
