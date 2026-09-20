import { UnrecognizedScrollShapeError } from '../errors/unrecognized-scroll-shape.error'
import type { InertiaScrollMetadata } from '../types'

/**
 * The offset-paginated shape the framework describes in
 * `paginatedResponseSchema` — `{ data, pagination: { page, limit, total, totalPages } }`.
 * Only the two fields the identifiers are derived from are required here.
 */
interface OffsetPaginatedResult {
  pagination: {
    page: number
    totalPages: number
  }
}

function isOffsetPaginatedResult(value: unknown): value is OffsetPaginatedResult {
  if (typeof value !== 'object' || value === null || !('pagination' in value)) {
    return false
  }

  const { pagination } = value
  if (typeof pagination !== 'object' || pagination === null) {
    return false
  }

  const { page, totalPages } = pagination as { page?: unknown; totalPages?: unknown }
  return Number.isInteger(page) && Number.isInteger(totalPages)
}

/**
 * The cursor-paginated shape `@stratal/framework`'s `db.$cursor` returns.
 * Only the fields the identifiers are derived from are required here, so the
 * ORM package stays out of this one's dependencies.
 */
interface CursorPageShape {
  cursorName: string
  cursor: string | null
  nextCursor: string | null
  prevCursor: string | null
}

function isCursorPageShape(value: unknown): value is CursorPageShape {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const { cursorName, cursor, nextCursor, prevCursor } = value as Record<string, unknown>

  return typeof cursorName === 'string'
    && (typeof cursor === 'string' || cursor === null)
    && (typeof nextCursor === 'string' || nextCursor === null)
    && (typeof prevCursor === 'string' || prevCursor === null)
}

/**
 * Derives the infinite-scroll identifiers from a paginated result.
 *
 * Recognises both of the framework's own paginated shapes — the offset one
 * `paginatedResponseSchema` describes, and the cursor one `db.$cursor`
 * returns. Anything else throws rather than guessing: a wrong `nextPage` reads
 * to the client as "no more pages" and silently truncates a list, so an
 * unrecognised shape has to be named at the call site with
 * `ctx.scroll(..., { metadata })`.
 */
export function deriveScrollMetadata(value: unknown): InertiaScrollMetadata {
  if (isOffsetPaginatedResult(value)) {
    const { page, totalPages } = value.pagination

    return {
      pageName: 'page',
      currentPage: page,
      previousPage: page > 1 ? page - 1 : null,
      nextPage: page < totalPages ? page + 1 : null,
    }
  }

  if (isCursorPageShape(value)) {
    return {
      pageName: value.cursorName,
      // The first page has no cursor of its own. `1` stands in as the position
      // identifier, which is what the client stores as its last-loaded page and
      // stamps on the rows it received.
      currentPage: value.cursor ?? 1,
      previousPage: value.prevCursor,
      nextPage: value.nextCursor,
    }
  }

  throw new UnrecognizedScrollShapeError(
    '[stratal:inertia] Cannot derive infinite-scroll metadata: the value is neither an offset-paginated '
    + 'result (`{ data, pagination: { page, totalPages } }`) nor a cursor-paginated one '
    + '(`{ data, cursorName, cursor, nextCursor, prevCursor }`). Pass `metadata` to `ctx.scroll()` to '
    + 'extract `pageName`, `currentPage`, `previousPage` and `nextPage` from this shape yourself.',
  )
}
