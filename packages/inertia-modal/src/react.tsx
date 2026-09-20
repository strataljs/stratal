// Load-bearing, despite `./react/modal` reaching this module too through its
// own `usePage()` call: the DTS bundler emits the `declare module
// '@inertiajs/core'` block only for a module reached by a bare import here, at
// the entry. A type-only import would keep every re-exported signature intact
// and still drop the ambient block — which is this entry's whole reason for
// existing, since `usePage().props.modal` is what a consumer of `./react`
// relies on. `tsdown.config.ts` asserts the emitted block.
import './page-props'

export { Modal } from './react/modal'
export { ModalLink } from './react/modal-link'
export { useModal } from './react/use-modal'
export { Deferred } from './react/deferred'
export { InfiniteScroll } from './react/infinite-scroll'
export { withModals } from './react/resolver'
export { resetModalState } from './react/reset'
export type { ModalLevel } from './react/modal-context'
export { MODAL_PROP } from './core/wire'
export type { ModalData } from './core/wire'
