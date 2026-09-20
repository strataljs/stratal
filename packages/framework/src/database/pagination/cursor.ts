import { CursorOrderingError } from '../errors/cursor-ordering.error'
import { MalformedCursorError } from '../errors/malformed-cursor.error'

/**
 * Reading rows from a position in an ordering.
 *
 * A primitive on its own terms, not a variant of anything: it answers "the N
 * rows after this row", and that is the whole contract. There are no page
 * numbers, no total, and no last page, because a cursor names a row rather than
 * an offset into a result set. It requires an ordering — a total one — which is
 * the price of addressing a row at all.
 *
 * What that buys: rows inserted or deleted around the reader do not move the
 * position. `LIMIT/OFFSET` addresses a place in a result set, so a row added
 * above the window shifts everything under it and the reader silently skips one
 * or sees one twice. Nothing here shifts.
 *
 * Knows nothing of HTTP or Inertia. A route can return the result as JSON, a
 * client can walk it, and `ctx.scroll()` can read it — none of which this file
 * is aware of.
 */

/** Sort direction for one ordering column. */
export type CursorSortOrder = 'asc' | 'desc'

/**
 * One ordering column. Several are combined left to right, as in SQL.
 *
 * Values may be `undefined` so an array of clause literals keeps its ordinary
 * inferred type — TypeScript widens `[{ updatedAt: 'desc' }, { id: 'desc' }]`
 * to a union whose members carry the other's key as `undefined`. A direction
 * that really is `undefined` at runtime still raises `CursorOrderingError`.
 */
export type CursorOrderBy = Record<string, CursorSortOrder | undefined>

export interface CursorPageArgs {
  /**
   * The cursor to read from, or `null` to start at the beginning of the
   * ordering. Opaque: it is minted by a previous result and passed back
   * verbatim. Never construct one.
   */
  cursor?: string | null
  /** Rows per page. The last page may hold fewer. */
  take: number
  /**
   * Ordering, applied left to right. Required — a cursor addresses a row's
   * position in an ordering, so without one there is no position to address.
   * The set must include {@link CursorPageArgs.uniqueBy}.
   */
  orderBy: CursorOrderBy | CursorOrderBy[]
  /**
   * The ordering column that makes the ordering total. Defaults to `id`.
   *
   * Ordering on a non-unique column alone leaves ties, and a cursor cannot
   * address a position inside a tie — which reintroduces exactly the skipping
   * that cursors exist to prevent. `updatedAt desc` needs an `id desc` after it.
   */
  uniqueBy?: string
  /** Filter, combined with the cursor's own condition. */
  where?: Record<string, unknown>
  /**
   * Relations to load, field selection, and fields to drop — handed to the
   * delegate untouched. `select` and `omit` must not drop an ordering column,
   * because the cursor is built from those.
   *
   * Deliberately not mutually exclusive here, unlike on `db.$cursor`, because
   * the delegate decides what they mean: a model delegate already refuses the
   * combination itself (`"select" and "omit" cannot be used together`), and a
   * hand-written one owns its `findMany` and may honour any combination.
   */
  include?: Record<string, unknown>
  select?: Record<string, unknown>
  omit?: Record<string, unknown>
  /** Query parameter name a caller should send the cursor under. Defaults to `cursor`. */
  cursorName?: string
}

/**
 * One page of rows read by cursor.
 *
 * Carries no `path` or page URLs, unlike Laravel's `CursorPaginator`. Building
 * a URL is a routing decision — which route, which of the current query
 * parameters to keep, whether a trailing slash is canonical — and a paginator
 * holds none of that. A route that wants links builds them from its own route
 * helper plus `nextCursor` / `prevCursor`.
 */
export interface CursorPageResult<TRow> {
  /** The rows for this page, in display order. */
  data: TRow[]
  /** Rows requested per page. The last page may hold fewer. */
  perPage: number
  /** Query parameter name the cursor travels under. */
  cursorName: string
  /**
   * The cursor this page was read from, or `null` on the first page.
   *
   * Laravel's `CursorPaginator::toArray()` omits both this and the cursor name
   * because it recovers them from the request. A result object has no request,
   * so it carries them.
   */
  cursor: string | null
  /** Cursor for the following page, or `null` when this is the last. */
  nextCursor: string | null
  /** Cursor for the preceding page, or `null` when this is the first. */
  prevCursor: string | null
}

/** Whether a cursor points forward (the next rows) or backward (the previous ones). */
type CursorDirection = 'next' | 'prev'

interface DecodedCursor {
  /** The ordering column values of the row the cursor addresses. */
  values: Record<string, unknown>
  direction: CursorDirection
}

/**
 * The query {@link readCursorPage} builds — the single declaration of it, used
 * both as the delegate's parameter type and as the type of the object handed to
 * `findMany`.
 *
 * Every key here must also be a key of a ZenStack `findMany` arg, because that
 * is what makes a model delegate satisfy {@link CursorPageDelegate}: ZenStack
 * types `findMany` as `<T extends FindManyArgs>(args?: SelectSubset<T, …>)`,
 * and `SelectSubset` maps each key of `T` to `never` unless the model's own
 * args declare it. A widened stand-in — `Record<string, unknown>` — infers `T`
 * to itself, collapses the whole parameter to `{ [x: string]: never }`, and no
 * delegate can satisfy it in either direction.
 */
export interface CursorFindManyArgs {
  where?: Record<string, unknown>
  orderBy?: CursorOrderBy[]
  take?: number
  include?: Record<string, unknown>
  select?: Record<string, unknown>
  omit?: Record<string, unknown>
}

/**
 * The minimum a model delegate has to offer.
 *
 * A ZenStack model delegate satisfies this structurally — `db.thread` is passed
 * as-is — and so does a hand-written `findMany`, which is how a query the ORM
 * cannot express (a `UNION`, a raw statement) is paged by the same primitive.
 */
export interface CursorPageDelegate<TRow> {
  findMany(args: CursorFindManyArgs): PromiseLike<TRow[]>
}

const CURSOR_DIRECTION_KEY = '_next'

/**
 * base64url, so a cursor survives a query string without escaping.
 *
 * The UTF-8 round trip is load-bearing, not ceremony: `btoa` accepts only
 * Latin-1, and `JSON.stringify` leaves non-ASCII characters as they are. An
 * ordering column is whatever the caller ordered by — a `title`, a `name`, a
 * `slug` — so one row whose value carries CJK, Cyrillic or an emoji would throw
 * `DOMException` while every ASCII row encoded fine. The first page would still
 * answer, because it mints no cursor; the 500 would land on the follow-up.
 */
function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input)
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='))
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
}

/**
 * Encodes the ordering values of a row plus the direction it points.
 *
 * The whole ordering tuple travels, not a row id, so the cursor still resolves
 * after the row it was built from is deleted — which is the case cursors are
 * for. The direction rides along because a caller sends every cursor under one
 * query parameter name and nothing else distinguishes forward from backward.
 */
export function encodeCursor(values: Record<string, unknown>, direction: CursorDirection): string {
  return base64UrlEncode(JSON.stringify({ ...values, [CURSOR_DIRECTION_KEY]: direction === 'next' }))
}

/** Reads a cursor minted by {@link encodeCursor}. Throws on anything else. */
export function decodeCursor(cursor: string): DecodedCursor {
  let parsed: unknown

  try {
    parsed = JSON.parse(base64UrlDecode(cursor))
  } catch (cause) {
    throw new MalformedCursorError(cause)
  }

  if (typeof parsed !== 'object' || parsed === null || !(CURSOR_DIRECTION_KEY in parsed)) {
    throw new MalformedCursorError()
  }

  const { [CURSOR_DIRECTION_KEY]: pointsToNext, ...values } = parsed as Record<string, unknown>

  return { values, direction: pointsToNext ? 'next' : 'prev' }
}

function normalizeOrderBy(orderBy: CursorOrderBy | CursorOrderBy[]): [string, CursorSortOrder][] {
  const entries = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap((clause) => Object.entries(clause))

  return entries.map(([field, direction]) => {
    if (direction !== 'asc' && direction !== 'desc') {
      throw new CursorOrderingError(
        `[stratal:database] $cursor needs a direction for "${field}"; got ${JSON.stringify(direction)}.`,
        field,
      )
    }
    return [field, direction]
  })
}

/**
 * Builds the keyset condition for "the rows after (or before) this position".
 *
 * For `updatedAt desc, id desc` this is
 * `updatedAt < :updatedAt OR (updatedAt = :updatedAt AND id < :id)` — one
 * disjunct per ordering column, each pinning the columns to its left to
 * equality. Reading backwards flips every comparison.
 */
function buildKeysetCondition(
  order: [string, CursorSortOrder][],
  values: Record<string, unknown>,
  direction: CursorDirection,
): Record<string, unknown> {
  const disjuncts: Record<string, unknown>[] = []

  for (let i = 0; i < order.length; i++) {
    const conjunct: Record<string, unknown> = {}

    for (let j = 0; j < i; j++) {
      const [field] = order[j]
      conjunct[field] = values[field]
    }

    const [field, sort] = order[i]
    const readingForward = direction === 'next'
    const descending = sort === 'desc'
    // Reading forward down a descending column means smaller values; either
    // flip alone reverses the comparison, both flips cancel.
    const operator = descending === readingForward ? 'lt' : 'gt'
    conjunct[field] = { [operator]: values[field] }

    disjuncts.push(conjunct)
  }

  return { OR: disjuncts }
}

/** The ordering values of a row, which is what a cursor is made of. */
function cursorValuesOf(row: Record<string, unknown>, order: [string, CursorSortOrder][]): Record<string, unknown> {
  const values: Record<string, unknown> = {}

  for (const [field] of order) {
    if (!(field in row)) {
      throw new CursorOrderingError(
        `[stratal:database] Cannot build a cursor: the ordering column "${field}" is not on the returned row. `
        + 'Either it is not a field of this model, or a `select` dropped it.',
        field,
      )
    }

    const value = row[field]
    if (value === null || value === undefined) {
      throw new CursorOrderingError(
        `[stratal:database] Cannot build a cursor: the ordering column "${field}" is null. `
        + '$cursor cannot order on a nullable column — null has no position in an ordering.',
        field,
      )
    }

    values[field] = value
  }

  return values
}

/**
 * Reads one page of rows by cursor.
 *
 * Fetches one row more than asked for, which is how the next page is known to
 * exist without a `COUNT` — and a count is what a growing list cannot give a
 * stable answer to anyway.
 *
 * @example
 * ```typescript
 * const page = await db.$cursor.$from(threadUnion, {
 *   cursor: ctx.query('cursor'),
 *   take: 20,
 *   orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
 *   where: { boardId },
 * })
 * ```
 */
export async function readCursorPage<TRow extends Record<string, unknown>>(
  delegate: CursorPageDelegate<TRow>,
  args: CursorPageArgs,
): Promise<CursorPageResult<TRow>> {
  const order = normalizeOrderBy(args.orderBy)

  if (order.length === 0) {
    throw new CursorOrderingError(
      '[stratal:database] $cursor requires `orderBy`. A cursor addresses a row\'s position in an '
      + 'ordering, so there is no position to address without one.',
    )
  }

  const uniqueBy = args.uniqueBy ?? 'id'
  if (!order.some(([field]) => field === uniqueBy)) {
    throw new CursorOrderingError(
      `[stratal:database] $cursor requires the ordering to include the unique column "${uniqueBy}", `
      + 'otherwise tied rows share a position and paging over them skips or repeats. '
      + `Add it last — e.g. \`orderBy: [{ ${order[0][0]}: '${order[0][1]}' }, { ${uniqueBy}: '${order[0][1]}' }]\` `
      + '— or name a different unique column with `uniqueBy`.',
    )
  }

  const decoded = args.cursor ? decodeCursor(args.cursor) : null
  const readingBackwards = decoded?.direction === 'prev'

  // Reading backwards walks away from the cursor, so the query runs in reversed
  // order and the rows are flipped back into display order below.
  const queryOrder: [string, CursorSortOrder][] = readingBackwards
    ? order.map(([field, sort]) => [field, sort === 'asc' ? 'desc' : 'asc'])
    : order

  const conditions: Record<string, unknown>[] = []
  if (args.where) conditions.push(args.where)
  if (decoded) conditions.push(buildKeysetCondition(order, decoded.values, decoded.direction))

  const query: CursorFindManyArgs = {
    ...(conditions.length > 0 ? { where: conditions.length === 1 ? conditions[0] : { AND: conditions } } : {}),
    orderBy: queryOrder.map(([field, sort]) => ({ [field]: sort })),
    // One extra row is the whole "is there another page" mechanism.
    take: args.take + 1,
    ...(args.include ? { include: args.include } : {}),
    ...(args.select ? { select: args.select } : {}),
    ...(args.omit ? { omit: args.omit } : {}),
  }

  const rows = await delegate.findMany(query)

  const hasExtraRow = rows.length > args.take
  const page = hasExtraRow ? rows.slice(0, args.take) : rows
  const data = readingBackwards ? [...page].reverse() : page

  const first = data[0]
  const last = data[data.length - 1]

  // With no rows there is no position to mint a cursor from, so both ends close.
  const nextCursor = last === undefined
    ? null
    : readingBackwards
      ? encodeCursor(cursorValuesOf(last, order), 'next')
      : hasExtraRow ? encodeCursor(cursorValuesOf(last, order), 'next') : null

  const prevCursor = first === undefined
    ? null
    : readingBackwards
      ? hasExtraRow ? encodeCursor(cursorValuesOf(first, order), 'prev') : null
      : decoded ? encodeCursor(cursorValuesOf(first, order), 'prev') : null

  return {
    data,
    perPage: args.take,
    cursorName: args.cursorName ?? 'cursor',
    cursor: args.cursor ?? null,
    nextCursor,
    prevCursor,
  }
}
