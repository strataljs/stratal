/**
 * The contract between the server and the browser.
 *
 * Framework-free, so both bundles can import it without pulling the other's machinery in behind it.
 */

/** The page prop one modal travels on. */
export const MODAL_PROP = 'modal'

/**
 * The levels beneath the requested one.
 *
 * Present only on a document response, which is the one case with no mounted page to graft onto.
 * An Inertia visit never carries it.
 */
export const MODAL_BENEATH_PROP = 'modalBeneath'

/**
 * Marks a response as a modal, so the client grafts it onto the page it already holds.
 *
 * On the RESPONSE rather than derived from request headers: a redirect drops whatever the original
 * visit was doing, and a modal reached by redirect must still graft.
 *
 * Outside the `x-inertia-*` namespace, which Inertia is still adding to — a silent collision there
 * would present as a partial reload returning the wrong props.
 */
export const MODAL_MARKER_HEADER = 'stratal-modal'

/** Set on the server's own background sub-request, so a modal route can tell it is a background. */
export const MODAL_DOCUMENT_HEADER = 'stratal-modal-document'

/**
 * One modal. A response never carries more than one.
 *
 * `TProps` is open so a caller reading a level back — a test asserting what a route put in a sheet —
 * names the props it expects instead of narrowing an untyped record at the call site.
 */
export interface ModalData<TProps = Record<string, unknown>> {
  component: string
  props: TProps
  /** This level's own address — pathname plus search. */
  url: string
  /** What sits beneath it: a page route, or another modal route. */
  base: string
  /** Where closing lands. Fixed when the level opens, never re-derived. */
  close: string
}

/**
 * Where one of this level's props lives on the page object.
 *
 * No key: a modal response carries exactly one modal, so there is nothing to disambiguate. A
 * targeted reload names this path and visits the level's own url, and the client knows which level
 * it belongs to because it issued the request from there.
 */
export function modalPropPath(prop: string): string {
  return `${MODAL_PROP}.props.${prop}`
}

/** Whether a partial-request prop name addresses the modal rather than the page beneath it. */
export function isModalPropPath(name: string): boolean {
  return name === MODAL_PROP || name.startsWith(`${MODAL_PROP}.`)
}

/**
 * Whether a value is a level this build understands.
 *
 * A tab open across a deploy can hold a payload from an older shape. Refusing it is what keeps the
 * client from rendering a level it cannot address.
 */
export function isModalData(value: unknown): value is ModalData {
  if (value === null || typeof value !== 'object') return false

  const candidate = value as Partial<ModalData>
  return (
    typeof candidate.component === 'string'
    && typeof candidate.url === 'string'
    && typeof candidate.base === 'string'
    && typeof candidate.close === 'string'
    && typeof candidate.props === 'object'
    && candidate.props !== null
  )
}

/**
 * The levels the client has open, sent on every modal visit.
 *
 * A level is not a place to land on. Without this the server can only see the `Referer`, which on a
 * visit made from a sheet is that sheet, and a level that takes it aims itself back at the sheet
 * the student is leaving.
 *
 * Outside the `x-inertia-*` namespace, which Inertia is still adding to, for the reason
 * `MODAL_MARKER_HEADER` is.
 */
export const MODAL_HELD_HEADER = 'stratal-modal-held'

/** The separator, which no percent-encoded url can contain. */
const HELD_SEPARATOR = ' '

/**
 * Held urls as one header value, outermost first.
 *
 * Encoded because a url carries a query and a header value has no way to say where one ends and the
 * next begins.
 */
export function encodeHeldLevels(urls: readonly string[]): string {
  return urls.map((url) => encodeURIComponent(url)).join(HELD_SEPARATOR)
}

/**
 * The urls back.
 *
 * An absent or unreadable header is read as nothing held rather than as an error: a tab open across
 * a deploy can send an older shape, and the honest answer to "what does this client hold" is then
 * "nothing I can trust", which lands on exactly the behaviour that existed before the header.
 */
export function decodeHeldLevels(header: string | null): string[] {
  if (header === null || header === '') return []

  try {
    return header
      .split(HELD_SEPARATOR)
      .filter((part) => part !== '')
      .map((part) => decodeURIComponent(part))
  }
  catch {
    return []
  }
}
