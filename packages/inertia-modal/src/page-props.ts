import type { ModalData } from './core/wire'

/**
 * Types the modal page props for every consumer of `@inertiajs/core`'s
 * `PageProps` — `usePage()`, `Page['props']`, and anything built on top of
 * them — instead of each call site re-declaring the same shape locally.
 *
 * `PageProps` carries `[key: string]: unknown`, so this merges cleanly: both keys are optional and
 * assignable to `unknown`, and they narrow only what callers actually read.
 */
declare module '@inertiajs/core' {
  interface PageProps {
    /**
     * `null` says the level is gone, where absence says nothing: a response naming props is merged
     * over the ones the page holds, and an omitted key is one the page keeps.
     */
    modal?: ModalData | null
    /** The chain a document response rebuilt, outermost first. `null` as for `modal`. */
    modalBeneath?: ModalData[] | null
  }
}

export {}
