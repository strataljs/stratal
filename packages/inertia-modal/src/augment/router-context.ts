import { RouterContext } from 'stratal/router'
import type { ModalRenderOptions, ModalService } from '../server/modal.service'
import { MODAL_TOKENS } from '../tokens'

declare module 'stratal/router' {
  interface RouterContext {
    /**
     * Renders `component` as a modal over whatever the client already has mounted.
     *
     * `options.base` declares what sits beneath this level — a page route, or another modal route.
     * On a document request that chain is followed and rendered, so a modal URL stays a permalink;
     * on an Inertia visit only this level is sent, and the client grafts it onto the page it holds.
     */
    modal(
      component: string,
      props: Record<string, unknown>,
      options: ModalRenderOptions,
    ): Promise<Response>
  }
}

export function augmentRouterContextWithModal(
  resolveService: (ctx: RouterContext) => ModalService,
): void {
  RouterContext.macro('modal', function (
    this: RouterContext,
    component: string,
    props: Record<string, unknown>,
    options: ModalRenderOptions,
  ) {
    return resolveService(this).render(this, component, props, options)
  })
}

export { MODAL_TOKENS }
