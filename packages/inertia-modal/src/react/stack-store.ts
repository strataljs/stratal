import type { ModalData } from '../core/wire'

/**
 * The open stack, held outside the React tree.
 *
 * CLIENT ONLY. A Workers isolate serves many requests, so a module-level value
 * read during SSR would leak one user's open sheets into another user's HTML.
 * `<Modal />` seeds from the payload on the server and consults this only in a
 * browser.
 */
let held: ModalData[] = []

export function readHeldStack(): ModalData[] {
  return held
}

export function holdStack(stack: ModalData[]): void {
  held = stack
}

export function clearHeldStack(): void {
  held = []
}
