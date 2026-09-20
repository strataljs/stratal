import type { Page } from '@inertiajs/core'
import { getSsrExcludeMatchers, isSsrExcluded } from '@stratal/inertia/services/ssr-exclusion'

import { isModalData, MODAL_BENEATH_PROP, MODAL_PROP } from '../core/wire'
import { rememberModalComponents, type ModalComponent } from './component-registry'
import { installGraft } from './graft'
import { installHeldHeader } from './held-header'

// This package targets Workers and deliberately omits the DOM lib, so `document` is not a known
// global. Its presence is the only thing asked of it here.
declare const document: object | undefined

/**
 * Wraps the `resolve` callback `createInertiaApp` is given, so a page's modal levels are resolved
 * before the tree renders.
 *
 * Resolution is a real `import()`, so it cannot happen during render. Doing it here — the one point
 * Inertia already awaits before it swaps the page — is what puts a level in server HTML and keeps a
 * step between levels from flashing an empty sheet.
 *
 * @example
 * ```tsx
 * createInertiaApp({
 *   resolve: withModals((name) => pages[`./pages/${name}.tsx`]()),
 *   setup: ({ el, App, props }) => hydrateRoot(el, <App {...props} />),
 * })
 * ```
 */
export function withModals<TComponent>(
  resolve: (name: string) => TComponent | Promise<TComponent>,
): (name: string, page?: Page) => Promise<TComponent> {
  resolveCallback = resolve

  return async (name, page) => {
    installGraft()
    installHeldHeader()

    const [component] = await Promise.all([resolve(name), prepare(resolve, page)])
    return component
  }
}

let resolveCallback: ((name: string) => unknown) | undefined

/**
 * Resolves one level's component after the tree has mounted.
 *
 * `<Modal />` needs this for a level the pre-pass could not reach — one excluded from SSR, on a
 * server, which by definition has no entry to resolve it from.
 */
export function resolveModalComponent(name: string): Promise<ModalComponent> {
  if (resolveCallback === undefined) {
    throw new Error(
      '[@stratal/inertia-modal] no resolver registered. Pass createInertiaApp\'s `resolve` through '
      + 'withModals() before rendering <Modal />.',
    )
  }

  return unwrap(resolveCallback(name))
}

/** Resolves every level the page carries that this runtime has an entry for. */
async function prepare<TComponent>(
  resolve: (name: string) => TComponent | Promise<TComponent>,
  page: Page | undefined,
): Promise<void> {
  if (page === undefined) return

  const top = page.props[MODAL_PROP]
  const beneath = page.props[MODAL_BENEATH_PROP]
  const levels = [...(Array.isArray(beneath) ? beneath : []), top].filter(isModalData)
  if (levels.length === 0) return

  const names = [...new Set(levels.map((level) => level.component))].filter(resolvableHere)

  const resolved = await Promise.all(names.map(async (component) => {
    try {
      return [component, await unwrap(resolve(component))] as const
    }
    catch (cause) {
      throw new Error(`[@stratal/inertia-modal] could not resolve modal component "${component}".`, { cause })
    }
  }))

  rememberModalComponents(Object.fromEntries(resolved))
}

/**
 * Whether this runtime has an entry to resolve `component` from.
 *
 * `ssrExclude` drops a page from the worker bundle, so on a server there is nothing to import —
 * which is the whole of what the option means. Every page stays in the client glob, so a browser
 * can always resolve one, and must: `<Modal />` draws nothing for a level whose component has not
 * landed, and its own resolve effect runs only once the page has already swapped. A level left to
 * that takes the sheet a visitor is looking at off the screen until the `import()` returns.
 *
 * Rendering it too early is not this decision. `<Modal />` withholds an excluded level for the
 * render that hydrates, which is the only one that has to match HTML the server produced.
 */
function resolvableHere(component: string): boolean {
  return typeof document !== 'undefined' || !isSsrExcluded(component, getSsrExcludeMatchers())
}

/** A page module's default export, or the module itself when it is the component. */
async function unwrap<TComponent>(loaded: TComponent | Promise<TComponent>): Promise<ModalComponent> {
  const mod = await loaded
  return (mod as { default?: ModalComponent }).default ?? (mod as ModalComponent)
}
