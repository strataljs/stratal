import { clearModalComponents } from './component-registry'
import { clearMountedPage } from './graft'
import { clearHeldStack } from './stack-store'

/**
 * Discard everything this package holds outside the React tree.
 *
 * Three stores survive unmounting, because each exists precisely to outlive a render: the open
 * stack, the page a level grafts onto, and the components resolved so far. In a browser that is
 * what they are for — one document, one visitor, state that must not reset when a sheet closes.
 * Under a test runner the same module is reused across files, so one test's open sheet is the next
 * test's starting state: a sheet nothing opened, or a component a test meant to leave unresolved
 * answering instantly from an earlier test's resolution.
 *
 * Call it between tests. It is the only supported way to empty them; the individual stores are
 * internal so that resetting cannot drift out of step with what the package holds.
 *
 * @example
 * ```ts
 * import { resetModalState } from '@stratal/inertia-modal/react'
 *
 * beforeEach(() => resetModalState())
 * ```
 */
export function resetModalState(): void {
  clearHeldStack()
  clearMountedPage()
  clearModalComponents()
}
