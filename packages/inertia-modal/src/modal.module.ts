import type { OnInitialize } from 'stratal/module'
import { Module } from 'stratal/module'
import { augmentRouterContextWithModal } from './augment/router-context'
import { ModalService } from './services/modal.service'
import { MODAL_TOKENS } from './tokens'

@Module({
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
