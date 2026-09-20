import { ApplicationError } from 'stratal/errors'

/**
 * Raised when a `$cursor` read is asked for an ordering it cannot address a row
 * in: no `orderBy`, a clause with no `asc`/`desc` direction, an ordering
 * without the unique column that breaks ties, or an ordering column that is
 * absent from the returned row or null on it.
 *
 * This is a **programming error**, not bad input — no request can recover from
 * it and no retry helps, because the query as written cannot produce a stable
 * position. Handlers should let it surface as a `500` and report it; the fix is
 * always in the caller's `orderBy`, `uniqueBy` or `select`. It deliberately
 * carries no HTTP status, so it is never mistaken for something the client sent
 * wrong.
 *
 * `field` names the ordering column at fault where one is identifiable, and is
 * reported to observability so the raise sites stay distinguishable without
 * matching on message text.
 */
export class CursorOrderingError extends ApplicationError {
  constructor(message: string, public readonly field?: string) {
    super(message)
  }

  public override reportContext(): Record<string, unknown> | undefined {
    return this.field === undefined ? undefined : { field: this.field }
  }
}
