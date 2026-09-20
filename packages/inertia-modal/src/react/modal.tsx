import { usePage } from '@inertiajs/react'
import { getSsrExcludeMatchers, isSsrExcluded } from '@stratal/inertia/services/ssr-exclusion'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { levelPath } from '../core/level-path'
import { isModalData, MODAL_BENEATH_PROP, MODAL_PROP, type ModalData } from '../core/wire'
import { readModalComponents, rememberModalComponents } from './component-registry'
import { holdMountedPage } from './graft'
import { ModalLevelContext, ModalStackContext } from './modal-context'
import { resolveModalComponent } from './resolver'
import { applyStack } from './stack'
import { holdStack, readHeldStack } from './stack-store'

// This package targets Workers and deliberately omits the DOM lib, so `document`
// is not a known global here. The guard only needs to know whether it exists,
// which is exactly what this declares — narrower than pulling DOM types in.
declare const document: object | undefined

/** The store below never changes, so there is nothing to subscribe to. */
const unchanging = () => () => {}

/**
 * Whether React is past the render that hydrates.
 *
 * `useSyncExternalStore`'s third argument is the value React reads while server-rendering and
 * while hydrating, and its second is what it switches to once hydration is over — so this asks
 * React which phase it is in rather than asking something to remember. Nothing to set, nothing to
 * reset between documents, and no answer that can outlive the render it describes.
 */
function usePastHydration(): boolean {
  return useSyncExternalStore(unchanging, () => true, () => false)
}

/**
 * Headless modal host. Place it once in your layout.
 *
 * Renders every open level, so a modal opened from inside another appears above it with the one
 * below still mounted.
 *
 * @example
 * ```tsx
 * export function DashboardLayout({ children }) {
 *   return (
 *     <>
 *       <main>{children}</main>
 *       <Modal />
 *     </>
 *   )
 * }
 * ```
 */
export function Modal() {
  // `modal` and `modalBeneath` come from the `PageProps` augmentation in `../page-props`,
  // bare-imported by this entry (`src/react.tsx`) — no type argument needed here.
  const page = usePage()
  const carried = page.props[MODAL_PROP]
  const incoming = isModalData(carried) ? carried : null
  const beneath = page.props[MODAL_BENEATH_PROP] ?? null
  const pastHydration = usePastHydration()

  // Seeded with an initializer rather than `[]`: the payload is already in props on the very first
  // render, and taking it in an effect is what kept every level out of server HTML and out of the
  // first client paint. The held stack is consulted only in a browser — a Workers isolate serves
  // many requests, so a module-level value read during SSR would put one user's open sheets into
  // another user's HTML.
  const [stack, setStack] = useState<ModalData[]>(() => {
    const held = typeof document !== 'undefined' ? readHeldStack() : []
    return applyStack(held, incoming, beneath)
  })

  // Read while deciding the next stack; reading it from state inside the effect would pin a stale
  // value between renders.
  const stackRef = useRef<ModalData[]>(stack)
  // What this render may draw, which is NOT the same as what has been resolved so
  // far. `withModals()` resolves a response's levels and remembers them BEFORE
  // Inertia swaps the page, so by the time a step's render runs the registry
  // already holds the arriving level — while state seeded at mount, back when
  // that level did not exist, does not. Reading the registry here is what lets
  // the arriving sheet be drawn in the same commit that drops the one it
  // replaces; state alone withholds it until an effect has copied the registry
  // across, leaving a commit with no sheet on screen at every step of a stack.
  const components = readModalComponents()

  // A level whose own chunk is still in flight when the stack changes is resolved by the effect
  // below, which writes it to that same registry — module state React is not subscribed to. This
  // is the render that reads it back.
  const [, redrawWithResolved] = useState(0)

  // The graft merges the next modal response onto the page as it stands, so it needs this one.
  useEffect(() => {
    holdMountedPage(page)
  }, [page])

  useEffect(() => {
    const next = applyStack(stackRef.current, incoming, beneath)
    stackRef.current = next
    if (typeof document !== 'undefined') holdStack(next)
    setStack(next)
  }, [incoming, beneath])

  // The levels this render cannot draw yet. Named as one string so the effect below depends on
  // WHICH components are missing rather than on the lookup object, whose identity never changes.
  // NUL joins them because it is the one character a component name cannot contain, so no name
  // can split back into two.
  const missing = [...new Set(stack.map((level) => level.component))]
    .filter((name) => !components[name])
    .join('\0')

  useEffect(() => {
    const wanted = missing === '' ? [] : missing.split('\0')
    if (wanted.length === 0) return

    let cancelled = false

    // Read once, outside the updater: a state updater must be pure, and React may run
    // one more than once or discard the render it belonged to, while the store write
    // below has to happen exactly once.
    const held = readModalComponents()

    void Promise.allSettled(wanted.map(async (name) => [name, await resolveModalComponent(name)] as const))
      .then((results) => {
        if (cancelled) return

        const next = { ...held }
        for (const result of results) {
          if (result.status === 'fulfilled') {
            const [name, component] = result.value
            next[name] = component
          }
        }
        rememberModalComponents(next)
        redrawWithResolved((n) => n + 1)

        // One mis-registered level must not blank out the others resolved in the same pass, but it
        // still needs a loud signal instead of a silent gap.
        for (const [index, result] of results.entries()) {
          if (result.status === 'rejected') {
            console.error(`inertia-modal: failed to resolve component "${wanted[index]}"`, result.reason)
          }
        }
      })

    return () => { cancelled = true }
  }, [missing])

  if (stack.length === 0) return null

  return (
    <ModalStackContext.Provider value={stack}>
      {stack.map((level, index) => {
        const Component = components[level.component]
        if (!Component) return null

        // A level the server had no entry to render must not be in the render that hydrates
        // either: hydration matches this tree against HTML that never contained it. It appears on
        // the very next render, which React schedules as soon as hydration is over.
        if (!pastHydration && isSsrExcluded(level.component, getSsrExcludeMatchers())) return null

        // Keyed by the level's identity rather than its address: keyed by the whole url, a filter
        // applied through `refresh()` gives the level a new key, and React answers a new key by
        // unmounting the old subtree — discarding the very state `refresh()` asks to preserve.
        return (
          <ModalLevelContext.Provider
            key={levelPath(level.url)}
            value={{ modal: level, depth: index, isTop: index === stack.length - 1 }}
          >
            <Component {...level.props} />
          </ModalLevelContext.Provider>
        )
      })}
    </ModalStackContext.Provider>
  )
}
