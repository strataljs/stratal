import { ApplicationError } from 'stratal/errors'

/**
 * Raised when `ctx.scroll()` is handed a value whose paging identifiers it
 * cannot derive: neither the offset shape `{ data, pagination: { page,
 * totalPages } }` nor the cursor shape `{ data, cursorName, cursor, nextCursor,
 * prevCursor }`.
 *
 * A **programming error**, and deliberately loud: guessing an identifier is
 * worse than failing, because a wrong `nextPage` reads to the client as "no
 * more pages" and silently truncates the list. No request recovers from it and
 * it carries no HTTP status. The fix is in the route — return one of the two
 * recognized shapes, or pass `metadata` to `ctx.scroll()` to extract
 * `pageName`, `currentPage`, `previousPage` and `nextPage` from this one.
 */
export class UnrecognizedScrollShapeError extends ApplicationError {}
