// The client holds the stack, because it is the only party that knows it.
//
// The server renders one level and names what sits beneath it. Where that level belongs is decided
// here, by matching its `base` against what is already open — which is why no stack, keys or depth
// header has to travel.
import { samePath } from '../core/level-path'
import type { ModalData } from '../core/wire'

/**
 * The stack after a response.
 *
 * `beneath` describes the chain a document response rebuilt, where there is nothing open to match
 * against and the whole chain arrives at once. It is only read while that holds: it travels in
 * props, which a partial response merges into rather than replaces, so it is still there long after
 * the response that meant it.
 */
export function applyStack(
  current: ModalData[],
  incoming: ModalData | null,
  beneath: ModalData[] | null,
): ModalData[] {
  if (incoming === null) return []

  // Only when nothing is open, which is the case it describes: a document response arrives with no
  // stack to match against and carries the whole chain. It is read from props, and Inertia merges a
  // partial response onto the props the page already holds — so it outlives the response that sent
  // it, and rebuilding the stack from it on a later one would seat that response's level on a chain
  // it never described, discarding what the open level holds.
  if (current.length === 0 && beneath !== null) return [...beneath, incoming]

  const held = current.find((level) => samePath(level.url, incoming.url))
  if (held !== undefined) {
    // The same level answering again — a refined query, a scroll fetch, a targeted reload.
    // Replacing rather than pushing is what keeps a filter from opening a second copy of the sheet,
    // and merging rather than overwriting is what keeps a narrowed answer from taking the rest of
    // the sheet's props away.
    //
    // `close` is fixed when the level opens, and this is where that holds. Closing the level above
    // lands here by visiting this level's url, and the server derives that response's `close` from
    // the Referer — which is the level that just closed. Taking it would aim this level back at the
    // one it came from, and the two would close onto each other without ever reaching the page.
    const merged: ModalData = {
      ...incoming,
      close: held.close,
      props: { ...held.props, ...incoming.props },
    }
    return [...current.slice(0, current.indexOf(held)), merged]
  }

  const parent = current.findIndex((level) => samePath(level.url, incoming.base))
  if (parent >= 0) return [...current.slice(0, parent + 1), incoming]

  // Its base is not open, so this is a stack of its own.
  return [incoming]
}
