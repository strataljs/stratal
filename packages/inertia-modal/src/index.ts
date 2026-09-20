// Load-bearing: the DTS bundler emits the `declare module '@inertiajs/core'`
// block only for a module reached by a bare import from this entry. This
// server-side entry builds and reads `Page` objects too (`modal.service.ts`
// keys `Page['props']` by `MODAL_PROP`), so the augmentation belongs here as
// much as on `./react`. A type-only import would drop the ambient block from
// this entry's emitted `.d.mts` without failing any in-repo check.
// `tsdown.config.ts` asserts the emitted block.
import './page-props'

export { ModalModule } from './modal.module'
export { MODAL_TOKENS } from './tokens'
// Exported so the DTS bundler reaches the module and emits its
// `declare module 'stratal/i18n'` block. Without it the `modal.*` keys are
// absent from `MessageKeys` for everyone outside this repo, and an app cannot
// name one of these messages to translate or override it.
export { modalMessages } from './i18n'
export type { ModalRenderOptions } from './server/modal.service'
export { ModalBackgroundFetchError } from './errors/modal-background-fetch.error'
export { ModalBaseCycleError } from './errors/modal-base-cycle.error'
// The dispatcher an application substitutes to send the background render somewhere other than the
// app in process.
export type { ModalBackgroundDispatcher } from './server/background'
// Asked by a gated route that must still render when it is the page beneath a modal.
export { isModalBackground } from './server/background'
export { MODAL_BENEATH_PROP, MODAL_DOCUMENT_HEADER, MODAL_MARKER_HEADER, MODAL_PROP } from './core/wire'
export type { ModalData } from './core/wire'

// Side-effect: augments RouterContext with ctx.modal()
export type {} from './augment/router-context'
