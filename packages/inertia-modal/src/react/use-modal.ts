import type {
  ReloadOptions,
  RequestPayload,
  UrlMethodPair,
  VisitHelperOptions,
  VisitOptions,
} from '@inertiajs/core'
import { router } from '@inertiajs/react'
import { useCallback, useContext } from 'react'

import { MODAL_PROP, modalPropPath, type ModalData } from '../core/wire'
import { ModalLevelContext, ModalStackContext } from './modal-context'

/** Function members are declared as properties, not methods: they are closures, and
 * destructuring them is how this hook is used. */
interface UseModalReturn {
  /** This level, or `undefined` outside a modal. */
  modal: ModalData | undefined
  /** How deep this level sits. The outermost is 0. */
  depth: number
  /** Whether this is the level the reader is looking at. */
  isTop: boolean
  /** Close this level and land where it was opened from. */
  close: <TPayload extends RequestPayload = RequestPayload>(
    options?: VisitOptions<TPayload>,
  ) => void
  /** Close every open level and land where the outermost one was opened from. */
  closeAll: <TPayload extends RequestPayload = RequestPayload>(
    options?: VisitOptions<TPayload>,
  ) => void
  /**
   * Re-read this level under a refined query — a filter, a sort, a code the server prices.
   *
   * Takes the same options as `router.get`, so a caller can observe the visit it started rather
   * than the next one to finish: without `onFinish` here, timing this means subscribing to the
   * router's own event, which fires for every visit in flight — a poll included.
   */
  refresh: <TPayload extends RequestPayload = RequestPayload>(
    query?: TPayload,
    options?: VisitHelperOptions<TPayload>,
  ) => void
  /**
   * Fetch some of this level's props again, leaving the rest of the page alone.
   *
   * Takes `router.reload`'s own options. `only`, `except` and `reset` name props, so they are given
   * in the level's terms — `'items'`, not `'modal.props.items'` — and anchored here; everything
   * else is passed through untouched.
   */
  reload: <TPayload extends RequestPayload = RequestPayload>(
    options?: ReloadOptions<TPayload>,
  ) => void
  /**
   * Open a modal route from code, the way `<ModalLink>` opens one from a click.
   *
   * Carries the same visit options, and takes the same arguments as `router.visit`, so anything
   * they accept — `replace`, a method, callbacks — is passed straight through.
   */
  visit: <TPayload extends RequestPayload = RequestPayload>(
    href: string | URL | UrlMethodPair,
    options?: VisitOptions<TPayload>,
  ) => void
}

/**
 * Closing is always an explicit visit, never `history.back()`.
 *
 * Going back is cheaper — the entry below is already in history, and Inertia answers it from cache
 * without touching the server. But a cached entry is a SNAPSHOT of the whole page as it was when
 * that entry was stored, and restoring it replaces every prop the page holds, not merely the modal
 * ones. A page that has changed since — an autosaving draft, a filtered list — is rewound to the
 * moment it was cached, with no sign that it happened. Landing on a URL asks the server instead:
 * what comes back cannot disagree with what is stored.
 */
const CLOSE_OPTIONS = { replace: true, preserveScroll: true, preserveState: true } as const

export function useModal(): UseModalReturn {
  const level = useContext(ModalLevelContext)
  const stack = useContext(ModalStackContext)
  const modal = level?.modal

  const close = useCallback(
    <TPayload extends RequestPayload = RequestPayload>(options: VisitOptions<TPayload> = {}) => {
      if (modal === undefined) return
      router.visit(modal.close, { ...CLOSE_OPTIONS, ...options })
    },
    [modal],
  )

  /**
   * Dismissing the whole stack is the outermost level closing: every level above it goes with it,
   * and it lands where it would have landed alone.
   */
  const closeAll = useCallback(
    <TPayload extends RequestPayload = RequestPayload>(options: VisitOptions<TPayload> = {}) => {
      const outermost = stack[0]
      if (outermost === undefined) return
      router.visit(outermost.close, { ...CLOSE_OPTIONS, ...options })
    },
    [stack],
  )

  /**
   * A refined re-read is an ordinary visit to this level's own url. The client recognises the
   * answer as this level by that url, so nothing has to declare the intent.
   */
  const refresh = useCallback(
    <TPayload extends RequestPayload = RequestPayload>(
      query?: TPayload,
      options: VisitHelperOptions<TPayload> = {},
    ) => {
      if (modal === undefined) return
      // Spread last, so a caller can override any of them — the same rule `visit()` follows.
      router.get(modal.url, query, {
        preserveState: true,
        preserveScroll: true,
        replace: true,
        ...options,
      })
    },
    [modal],
  )

  const reload = useCallback(
    <TPayload extends RequestPayload = RequestPayload>(options: ReloadOptions<TPayload> = {}) => {
      // `router.reload` preserves scroll and state itself, so neither is named here.
      //
      // Three of its fields name props, and a level's props are not where the client sees them.
      // Each is anchored only when given: writing `only: undefined` into the options would read as
      // a request for no props rather than as the absence of a request.
      router.reload({
        ...options,
        ...(options.only && { only: options.only.map(modalPropPath) }),
        ...(options.except && { except: options.except.map(modalPropPath) }),
        ...(options.reset && { reset: options.reset.map(modalPropPath) }),
      })
    },
    [],
  )

  /**
   * The options `<ModalLink>` sets, applied to a visit made from code. Spread first so a caller
   * can override any of them, exactly as passing the prop to the component would.
   */
  const visit = useCallback(
    <TPayload extends RequestPayload = RequestPayload>(
      href: string | URL | UrlMethodPair,
      options: VisitOptions<TPayload> = {},
    ) => {
      router.visit(href, {
        only: [MODAL_PROP],
        preserveState: true,
        preserveScroll: true,
        ...options,
      })
    },
    [],
  )

  return {
    modal,
    depth: level?.depth ?? 0,
    isTop: level?.isTop ?? false,
    close,
    closeAll,
    refresh,
    reload,
    visit,
  }
}
