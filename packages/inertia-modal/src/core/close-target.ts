/**
 * Where a level lands when it closes.
 *
 * Resolved ONCE, when the level opens, and echoed by the client on every later request for it. A
 * target re-derived per answer drifts: on a refresh the browser's `Referer` is the sheet itself, so
 * the referer branch stops matching and the answer silently falls back to `base` — losing whatever
 * query the list had.
 */
import { levelPath, samePath } from './level-path'

export interface CloseTargetInput {
  /** The request's `Referer`, if any. */
  referer: string | null
  /** The route's declared background. */
  base: string
  /** The URL being requested. */
  requestURL: string
  /** The app's own origin; a referer from anywhere else is not a page we can land on. */
  origin: string
  /**
   * The levels the client has open, from `MODAL_HELD_HEADER`.
   *
   * A sheet the student is leaving is not a place to land on. A visit made from one sends it as the
   * `Referer`, and a level that took it would aim itself back at that sheet; the two then close onto
   * each other without ever reaching the page. The one open level that IS a place to land on is this
   * level's own `base` — the thing it was opened over.
   */
  held: readonly string[]
}

/**
 * The page this level closes onto.
 *
 * The referer is preferred because it is the page the user is actually looking at, query and all,
 * where `base` is usually written query-free.
 */
export function resolveCloseTarget({ referer, base, requestURL, origin, held }: CloseTargetInput): string {
  if (referer === null) return base

  let refererURL: URL
  try {
    refererURL = new URL(referer)
  }
  catch {
    // A referer we cannot parse tells us nothing; the declared base is what the route promised.
    return base
  }

  if (refererURL.origin !== origin) return base

  // Compared as levels, because a level's query is what it is currently showing rather than what
  // it is, and one route has two spellings wherever an app appends a trailing slash.
  const refererPath = levelPath(refererURL.pathname)

  // An open referer is the thing this level sits over only when it is the declared `base`; any
  // other open level is a sibling, and landing on one closes the two onto each other. That base is
  // taken from the referer rather than from `base` because the referer carries the query it is
  // showing — the filter a list was narrowed by — where the declaration is written without one.
  const isDeclaredBase = samePath(refererPath, base)
  if (!isDeclaredBase && held.some((url) => samePath(url, refererPath))) return base

  // A refresh of the sheet sends the sheet's own url. Landing there would make closing a no-op.
  if (samePath(refererURL.pathname, new URL(requestURL).pathname)) return base

  return `${refererURL.pathname}${refererURL.search}`
}
