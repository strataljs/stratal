// Applying a modal response onto the page the client already has mounted.
//
// The server sends one level and nothing else. Grafting is what makes that enough: the response
// takes the mounted page's component and props, so Inertia treats it as the same page and merges
// rather than replaces — which is why a modal reached by redirect still lands on the page behind it.
import { interceptors } from '@inertiajs/core'
import type { HttpResponse, InternalActiveVisit, Page } from '@inertiajs/core'

import { flushSync } from 'react-dom'

import { samePath } from '../core/level-path'
import { isModalData, MODAL_BENEATH_PROP, MODAL_MARKER_HEADER, MODAL_PROP } from '../core/wire'
import { dismissLevels } from './scroll-teardown'
import { applyStack } from './stack'
import { readHeldStack } from './stack-store'

// This package targets Workers and deliberately omits the DOM lib, so `document` is not a known
// global here. The guard only needs to know whether it exists, which is exactly what this declares.
declare const document: object | undefined

/** The mounted page, as `<Modal />` last saw it. Client-only; the graft never runs on a server. */
let mounted: Page | null = null

export function holdMountedPage(page: Page): void {
  mounted = page
}

export function clearMountedPage(): void {
  mounted = null
}

/**
 * Rewrites `incoming` in place so it reads as the mounted page carrying a modal.
 *
 * In place because Inertia captures the parsed page object before it runs its response handlers and
 * merges props against that same reference — a replacement object would be dropped.
 *
 * Only the top level of the mounted props is copied. A deep clone would walk the whole background
 * payload on every sheet open, which on a page with many resolved props is real main-thread time.
 */
export function graftOnto(incoming: Page, page: Page): void {
  incoming.component = page.component

  // The chain beneath only ever arrives on a document response. Carried forward from the mounted
  // page it would re-seed the stack from a snapshot taken before anything was opened or closed.
  const { [MODAL_BENEATH_PROP]: _seededChain, ...mounted } = page.props
  incoming.props = { ...mounted, ...incoming.props }

  if (page.scrollProps !== undefined || incoming.scrollProps !== undefined) {
    incoming.scrollProps = { ...page.scrollProps, ...incoming.scrollProps }
  }
  if (page.onceProps !== undefined || incoming.onceProps !== undefined) {
    incoming.onceProps = { ...page.onceProps, ...incoming.onceProps }
  }
}

let installed = false

/**
 * Starts grafting modal responses onto the mounted page.
 *
 * Idempotent, and installed from the resolver rather than at module scope so importing this package
 * has no side effect.
 */
export function installGraft(): void {
  if (installed || typeof document === 'undefined') return
  installed = true

  interceptors.onVisitResponse((_visit: InternalActiveVisit, response: HttpResponse) => {
    const data: unknown = response.data
    const page = typeof data === 'object' && data !== null ? (data as Page) : null
    const isModal = response.headers[MODAL_MARKER_HEADER] === 'true'

    if (isModal && mounted !== null && page !== null) {
      graftOnto(page, mounted)
    }

    if (page !== null) dropDismissedLevels(page, isModal)

    return response
  })
}

/**
 * Take the levels this response drops off the page, before the page changes.
 *
 * A level's props sit at `modal.props.*`, and anything addressing them by path — a scroll
 * subscription, for one — reads that path off the page whenever Inertia announces a response. The
 * path exists only while the level does, so a response that drops the level leaves those reads
 * looking for something the new page does not carry.
 *
 * Here rather than at a dismissal, because a level is dropped by any navigation at all: closing it,
 * the browser's back button, a link to somewhere else entirely. Interceptors run before the page is
 * set and before that announcement, which is the only point early enough to matter — flushed, so
 * React has removed them by then rather than at the next render, which comes after.
 */
export function dropDismissedLevels(page: Page, isModal: boolean): void {
  const held = readHeldStack()
  if (held.length === 0) return

  const carried = page.props[MODAL_PROP]
  const incoming = isModal && isModalData(carried) ? carried : null
  const beneath = page.props[MODAL_BENEATH_PROP]
  const next = applyStack(held, incoming, Array.isArray(beneath) ? beneath.filter(isModalData) : null)

  // A response that names props is merged over the ones the page holds rather than replacing them,
  // so a landing that carries no level leaves the level it dismissed exactly where it was: the
  // sheet stays on screen, over a page that has already moved on, with nothing left that can close
  // it. Naming them empty is what a merge can overwrite — omitting them is what it keeps.
  if (next.length === 0) {
    page.props[MODAL_PROP] = null
    page.props[MODAL_BENEATH_PROP] = null
  }

  const dropped = held
    .filter((level) => !next.some((kept) => samePath(kept.url, level.url)))
    .map((level) => level.url)

  if (dropped.length > 0) flushSync(() => dismissLevels(dropped))
}
