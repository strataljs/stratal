// A level's props are nested under one page prop, so every piece of Inertia's prop metadata has to
// name them at that depth or it addresses nothing.
import { isModalPropPath, MODAL_PROP } from './wire'

const PREFIX = `${MODAL_PROP}.props.`

const ARRAY_KEYS = ['mergeProps', 'prependProps', 'deepMergeProps', 'matchPropsOn'] as const
const RECORD_OF_ARRAY_KEYS = ['deferredProps'] as const

/** Rewrites every metadata entry on `page` to address `modal.props.*`. */
export function anchorPropMetadata(page: Record<string, unknown>): Record<string, unknown> {
  const anchored: Record<string, unknown> = { ...page }

  for (const key of ARRAY_KEYS) {
    const value = anchored[key]
    if (Array.isArray(value)) {
      anchored[key] = value.map((entry) => `${PREFIX}${String(entry)}`)
    }
  }

  for (const key of RECORD_OF_ARRAY_KEYS) {
    const value = anchored[key]
    if (isRecord(value)) {
      anchored[key] = Object.fromEntries(
        Object.entries(value as Record<string, string[]>).map(([group, names]) => [
          group,
          names.map((name) => `${PREFIX}${name}`),
        ]),
      )
    }
  }

  const scrollProps = anchored.scrollProps
  if (isRecord(scrollProps)) {
    anchored.scrollProps = Object.fromEntries(
      Object.entries(scrollProps).map(([name, entry]) => [`${PREFIX}${name}`, entry]),
    )
  }

  const onceProps = anchored.onceProps
  if (isRecord(onceProps)) {
    // A once entry names a prop inside itself as well as being keyed by one, and the client reads
    // both as paths — anchoring only the key leaves the entry pointing at the page root.
    anchored.onceProps = Object.fromEntries(
      Object.entries(onceProps as Record<string, { prop: string }>).map(([name, entry]) => [
        `${PREFIX}${name}`,
        { ...entry, prop: `${PREFIX}${entry.prop}` },
      ]),
    )
  }

  return anchored
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * What a partial reload asks of the level.
 *
 * Three answers, because a reload can name the level's props, the level itself, or nothing about
 * it at all — and the third is not the same as asking for all of it. A reload for a prop of the
 * page around the sheet leaves the level exactly as the client already holds it, so re-resolving
 * it answers a question nobody asked: its `defer()` props go unresolved and are advertised again,
 * and the client, reading that as work still outstanding, fetches them again.
 */
export type LevelAsk =
  /** Every prop. A first render of the level, or a reload naming the level itself. */
  | { readonly kind: 'whole' }
  /** Only these, named as the level keys them. */
  | { readonly kind: 'props'; readonly names: string[] }
  /** Nothing: what the client holds of this level is still current. */
  | { readonly kind: 'unchanged' }

export function levelAskFor(partialData: string | null): LevelAsk {
  if (partialData === null || partialData.trim() === '') return { kind: 'whole' }

  const names = partialData.split(',').map((name) => name.trim())
  const modalNames = names.filter((name) => isModalPropPath(name))

  // A partial reload for a PAGE prop is not addressed to the level. Answering it with a fresh
  // level would also replace the page the client is on.
  if (modalNames.length === 0) return { kind: 'unchanged' }

  // The level itself rather than anything inside it — what `<ModalLink>` and `useModal().visit()`
  // ask for. Naming it alongside props inside it still asks for the whole level: the wider request
  // is the one that has to be honoured.
  if (modalNames.includes(MODAL_PROP)) return { kind: 'whole' }

  return { kind: 'props', names: levelPropNames(modalNames) }
}

/**
 * The level-relative names among a page-anchored list, dropping any addressed elsewhere.
 *
 * Inertia's prop metadata travels page-anchored, because `modal.props.x` is where the client sees
 * the prop. The level's own props are keyed by the bare name, so anything resolving them has to ask
 * in those terms or it names nothing that exists.
 */
export function levelPropNames(names: readonly string[]): string[] {
  return names.filter((name) => name.startsWith(PREFIX)).map((name) => name.slice(PREFIX.length))
}
