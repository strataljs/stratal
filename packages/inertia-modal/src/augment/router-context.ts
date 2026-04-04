import { RouterContext } from 'stratal/router'
import type { ModalRenderOptions, ModalService } from '../services/modal.service'
import { MODAL_TOKENS } from '../tokens'

declare module 'stratal/router' {
  interface RouterContext {
    /**
     * Renders a modal page component over a background page.
     *
     * The background page at `options.baseURL` is always rendered as the main
     * Inertia page. The given `component` and `props` are embedded in the
     * background page's `modal` prop and rendered as an overlay by the
     * client-side `<Modal>` component.
     *
     * Handles direct URL visits by fetching the background page in-process.
     * Handles partial reloads (e.g., cascading selects) when `only: ['modal']`
     * is requested.
     */
    inertiaModal(
      component: string,
      props: Record<string, unknown>,
      options: ModalRenderOptions,
    ): Promise<Response>
  }
}

export function augmentRouterContextWithModal(
  resolveService: (ctx: RouterContext) => ModalService,
): void {
  RouterContext.macro('inertiaModal', function (
    this: RouterContext,
    component: string,
    props: Record<string, unknown>,
    options: ModalRenderOptions,
  ) {
    const service = resolveService(this)
    return service.render(this, component, props, options)
  })
}

export { MODAL_TOKENS }
