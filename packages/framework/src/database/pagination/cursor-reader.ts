import type { FindManyArgs, QueryOptions, SelectSubset, SimplifiedPlainResult } from '@zenstackhq/orm'
import type { GetModels, SchemaDef } from '@zenstackhq/orm/schema'
import { CursorModelUnavailableError } from '../errors/cursor-model-unavailable.error'
import type { DeclaredMembers } from '../types'
import { readCursorPage, type CursorPageDelegate, type CursorPageResult, type CursorSortOrder } from './cursor'

/**
 * Per-model cursor reading: `db.$cursor.thread.findMany({ … })`.
 *
 * A namespace of its own rather than an argument on the model's own `findMany`,
 * because ZenStack already has a `cursor` there and it means something else. Its
 * `cursor` takes a `WhereUniqueInput` and resolves the row's ordering values by
 * subquery at query time, so the row must still exist, still pass the query's
 * own `where`, and still hold the ordering values it held when the cursor was
 * minted. Two arguments spelled `cursor` on one call, one of which answers an
 * empty page when its row is deleted, is not a distinction a caller should have
 * to hold. In here there is exactly one: {@link CursorReaderArgs} omits
 * ZenStack's `cursor` and the `skip` that goes with it.
 */

/**
 * The query-relevant options the result and argument types read.
 *
 * `QueryOptions` is what ZenStack's own `SimplifiedPlainResult` and `FindManyArgs` default this
 * slot to. Narrowing `ClientOptions` to the keys they share yields that same type, but reaches
 * it through `keyof ClientOptions`, which instantiates the client-only `computedFields` map
 * across every model and field in the schema for a result that never reads it.
 */
type Options<Schema extends SchemaDef> = QueryOptions<Schema>

/** The client keys that address a model — `Post` in the schema is `post` here. */
export type CursorModelKey<Schema extends SchemaDef> = Uncapitalize<GetModels<Schema>>

/** The schema model a client key addresses. */
type ModelOf<Schema extends SchemaDef, Key extends CursorModelKey<Schema>> =
  Extract<GetModels<Schema>, { [M in GetModels<Schema>]: Uncapitalize<M> extends Key ? M : never }[GetModels<Schema>]>

/** One row of a model, before `select`/`include` narrow it. */
type PlainRow<Schema extends SchemaDef, Key extends CursorModelKey<Schema>> =
  SimplifiedPlainResult<Schema, ModelOf<Schema, Key>, {}, Options<Schema>>

/**
 * The ordering, restricted to the model's own scalar columns.
 *
 * Narrower than ZenStack's `orderBy` on purpose: a cursor is built from the
 * ordering values of a row, so an ordering that reaches through a relation or
 * sorts on a computed relevance score has no value to carry. Those are
 * unrepresentable here rather than accepted and failed on at runtime.
 */
export type CursorOrderByOf<Schema extends SchemaDef, Key extends CursorModelKey<Schema>> =
  Partial<Record<keyof PlainRow<Schema, Key> & string, CursorSortOrder>>

/**
 * A model's `findMany` arguments, with cursor paging in place of offset paging.
 *
 * `skip` goes with ZenStack's `cursor` and addresses a place in a result set,
 * which is the thing a cursor exists not to do. `distinct` changes which row
 * represents a group, so no row has a stable position to address.
 *
 * Dropping an argument here only stops it being declared; what refuses it at a
 * call site is {@link CursorModelReader.findMany} passing this through
 * ZenStack's `SelectSubset`.
 */
export type CursorReaderArgs<Schema extends SchemaDef, Key extends CursorModelKey<Schema>> =
  & Omit<
    FindManyArgs<Schema, ModelOf<Schema, Key>, Options<Schema>>,
    'cursor' | 'skip' | 'take' | 'orderBy' | 'distinct'
  >
  & {
    /**
     * The cursor to read from, or `null`/absent to start at the beginning of
     * the ordering. Opaque: it is minted by a previous result and passed back
     * verbatim. Never construct one.
     */
    cursor?: string | null
    /** Rows per page. The last page may hold fewer. */
    take: number
    /**
     * Ordering, applied left to right. Required, and must end in a unique
     * column — a cursor addresses a row's position in an ordering, and a
     * position inside a tie cannot be addressed.
     */
    orderBy: CursorOrderByOf<Schema, Key> | CursorOrderByOf<Schema, Key>[]
    /** The ordering column that makes the ordering total. Defaults to `id`. */
    uniqueBy?: keyof PlainRow<Schema, Key> & string
    /** Query parameter name a caller should send the cursor under. Defaults to `cursor`. */
    cursorName?: string
  }

/**
 * One model's cursor reader.
 *
 * The argument goes through ZenStack's own `SelectSubset`, which is what a
 * model's `findMany` uses and is the whole of the refusal machinery here. It
 * maps any key the arguments do not declare to `never` — restoring the
 * excess-property refusal a bare type parameter switches off, so `skip`,
 * `distinct` and the native `cursor` are rejected — and it carries ZenStack's
 * conditional messages for `select` with `include` and `select` with `omit`.
 * Restating those exclusions by hand would answer the same mistake with a worse
 * message; rebuilding the argument type without it drops them silently, which
 * is what an earlier revision of this file did.
 *
 * `Args` is still inferred from the call, so `select` narrows the row type.
 */
export interface CursorModelReader<Schema extends SchemaDef, Key extends CursorModelKey<Schema>> {
  findMany<Args extends CursorReaderArgs<Schema, Key>>(
    args: SelectSubset<Args, CursorReaderArgs<Schema, Key>>,
  ): Promise<CursorPageResult<SimplifiedPlainResult<Schema, ModelOf<Schema, Key>, Args, Options<Schema>>>>
}

/**
 * Arguments for a page read from a caller-supplied `findMany`.
 *
 * The row type comes from the delegate — the framework has no schema for a
 * `UNION` — and the ordering is keyed to it, so ordering on a column the query
 * does not return is a compile error instead of the `CursorOrderingError` it
 * would raise once the first row came back.
 *
 * No `select`, `include` or `omit`. They are ZenStack model arguments; a
 * caller-written `findMany` decides for itself what to return, and the framework
 * can neither type them against the row nor make the delegate honour them — an
 * option that may be silently ignored is worse than one that is absent. A
 * caller that wants fewer columns selects fewer inside its own `findMany`.
 *
 * `where` stays, and is not a passthrough: the paginator combines it with the
 * keyset condition it builds, so it is how the page is positioned at all. It
 * cannot be typed here because its shape is the delegate's own filter language.
 */
export interface CursorSourceArgs<TRow> {
  /**
   * The cursor to read from, or `null`/absent to start at the beginning of the
   * ordering. Opaque: it is minted by a previous result and passed back
   * verbatim. Never construct one.
   */
  cursor?: string | null
  /** Rows per page. The last page may hold fewer. */
  take: number
  /**
   * Ordering, applied left to right. Required, and must end in a unique column
   * — a cursor addresses a row's position in an ordering, and a position inside
   * a tie cannot be addressed.
   */
  orderBy: CursorSourceOrderBy<TRow> | CursorSourceOrderBy<TRow>[]
  /** The ordering column that makes the ordering total. Defaults to `id`. */
  uniqueBy?: CursorSourceColumn<TRow>
  /** Filter, combined with the cursor's own condition and handed to the delegate. */
  where?: Record<string, unknown>
  /** Query parameter name a caller should send the cursor under. Defaults to `cursor`. */
  cursorName?: string
}

/**
 * A column of the delegate's row.
 *
 * `DeclaredMembers` strips the index signature that {@link CursorPageDelegate}'s
 * row constraint obliges a caller to write (`interface Row extends
 * Record<string, unknown>`). Without it `keyof` is `string` and every name
 * typechecks, which is the whole of the guarantee here.
 */
export type CursorSourceColumn<TRow> = keyof DeclaredMembers<TRow> & string

/** An ordering clause over the delegate's own columns. */
export type CursorSourceOrderBy<TRow> = Partial<Record<CursorSourceColumn<TRow>, CursorSortOrder>>
/**
 * Reads a page from something that is not a model — a `UNION`, a raw statement —
 * by supplying the `findMany` yourself.
 *
 * Sits beside the model keys rather than in a separate export because it is the
 * same operation on a different source, and because a free function has no
 * client to belong to: on a transaction client, `tx.$cursor.$from(…)` reads
 * inside the transaction, which an imported function could not do.
 *
 * The `$` prefix is what keeps it from colliding with a model: a client key is
 * an uncapitalized model name, and ZenStack reserves the prefix for members of
 * the client itself.
 */
export interface CursorSourceReader {
  $from<TRow extends Record<string, unknown>>(
    delegate: CursorPageDelegate<TRow>,
    args: CursorSourceArgs<NoInfer<TRow>>,
  ): Promise<CursorPageResult<TRow>>
}

/** `db.$cursor` — one reader per model in the schema, plus `$from` for anything else. */
export type CursorReader<Schema extends SchemaDef> =
  & { [Key in CursorModelKey<Schema>]: CursorModelReader<Schema, Key> }
  & CursorSourceReader

/** The client members {@link createCursorReader} contributes. */
export interface CursorClientMembers<Schema extends SchemaDef> {
  /**
   * Reads one page of a model's rows by cursor, for a list that changes while
   * it is read.
   *
   * @example
   * ```typescript
   * const page = await db.$cursor.thread.findMany({
   *   cursor: ctx.query('cursor'),
   *   take: 20,
   *   orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
   *   where: { boardId },
   * })
   * ```
   */
  $cursor: CursorReader<Schema>
}

/** The subset of a client this reader needs: a delegate per model key. */
type DelegateSource = Record<string, CursorPageDelegate<Record<string, unknown>> | undefined>

/**
 * Builds the reader eagerly, one entry per model the schema declares.
 *
 * A plain object rather than a `Proxy`: the model list is known here, and a
 * proxy would answer every property — `then`, `constructor`, an inspector's
 * probe — with something that looks like a reader.
 *
 * The delegate is resolved per call, not captured: ZenStack builds a fresh CRUD
 * handler on each model access, and holding one would pin it for the life of
 * the client.
 */
export function createCursorReader<Schema extends SchemaDef>(
  client: unknown,
  schema: Schema,
): CursorReader<Schema> {
  const source = client as DelegateSource
  const models = Object.keys(schema.models ?? {})

  const modelEntries = models.map((model) => {
    const key = (model.charAt(0).toLowerCase() + model.slice(1))

    const reader = {
      findMany: (args: Record<string, unknown>) => {
        const delegate = source[key]
        if (!delegate) throw new CursorModelUnavailableError(key)

        const { cursor, take, orderBy, uniqueBy, cursorName, where, include, select, omit } = args as {
          cursor?: string | null
          take: number
          orderBy: Record<string, CursorSortOrder> | Record<string, CursorSortOrder>[]
          uniqueBy?: string
          cursorName?: string
          where?: Record<string, unknown>
          include?: Record<string, unknown>
          select?: Record<string, unknown>
          omit?: Record<string, unknown>
        }

        return readCursorPage(delegate, {
          cursor,
          take,
          orderBy,
          uniqueBy,
          cursorName,
          where,
          include,
          select,
          omit,
        })
      },
    }

    return [key, reader] as const
  })

  const sourceReader: CursorSourceReader = {
    $from: (delegate, args) => readCursorPage(delegate, args),
  }

  return Object.assign(Object.fromEntries(modelEntries), sourceReader) as CursorReader<Schema>
}
