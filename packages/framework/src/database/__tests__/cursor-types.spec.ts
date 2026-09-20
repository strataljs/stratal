import { describe, expect, expectTypeOf, it } from 'vitest'
import type { DatabaseService, TransactionService } from '../database.service'
import type { CursorFindManyArgs, CursorOrderBy, CursorPageDelegate, CursorPageResult } from '../pagination/cursor'

/**
 * Whether a delegate is accepted is a compile-time fact with no runtime shadow:
 * `$from` calls `findMany` and returns its rows either way, so a behavioural
 * test passes even when the documented call no longer typechecks. Nothing below
 * is executed — the functions are declared for their types and never called.
 *
 * As in `database-service-types.spec.ts`, this project does not enable vitest's
 * typecheck mode, so the `expectTypeOf` assertions are runtime no-ops. Only
 * `yarn workspace @stratal/framework typecheck` enforces them; the
 * `@ts-expect-error` directives are enforced by the same run.
 */

declare const db: DatabaseService

interface CustomRow extends Record<string, unknown> {
  id: string
  updatedAt: string
  title: string
}

/** A hand-written delegate, as a `UNION` or a raw query needs. */
declare const declaredDelegate: CursorPageDelegate<CustomRow>

/** The same, written structurally with a widened parameter, as test doubles are. */
declare const looseDelegate: { findMany(args: Record<string, unknown>): Promise<CustomRow[]> }

/** And with the parameter the paginator actually passes. */
declare const preciseDelegate: { findMany(args: CursorFindManyArgs): Promise<CustomRow[]> }

const ORDER: CursorOrderBy[] = [{ updatedAt: 'desc' }, { id: 'desc' }]

function pageOfModelRows() {
  return db.$cursor.$from(db.post, { take: 20, orderBy: ORDER })
}

function pageThroughReader() {
  return db.$cursor.post.findMany({ take: 20, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] })
}

function sourceInsideTransaction() {
  return db.$transaction((tx) => tx.$cursor.$from(declaredDelegate, { take: 20, orderBy: ORDER }))
}

function readerInsideTransaction() {
  return db.$transaction((tx) =>
    tx.$cursor.post.findMany({ take: 20, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] }))
}

function pageOfDeclaredDelegate() {
  return db.$cursor.$from(declaredDelegate, { take: 20, orderBy: ORDER })
}

function pageOfLooseDelegate() {
  return db.$cursor.$from(looseDelegate, { take: 20, orderBy: ORDER })
}

function pageOfPreciseDelegate() {
  return db.$cursor.$from(preciseDelegate, { take: 20, orderBy: ORDER })
}

type ModelRow = Awaited<ReturnType<typeof pageOfModelRows>>['data'][number]
/** The reader's argument type, in type position only — `db` has no runtime value here. */
type ReaderArgs = Parameters<typeof db.$cursor.post.findMany>[0]

describe('$from delegate acceptance', () => {
  it('takes a ZenStack model delegate', () => {
    // ZenStack types `findMany` as `<T extends FindManyArgs>(args?:
    // SelectSubset<T, …>)`, and a widened parameter on this side infers `T` to
    // itself, collapsing `SelectSubset` to `{ [x: string]: never }` — which
    // nothing satisfies in either direction. Naming the query the paginator
    // builds is what makes a model delegate assignable.
    expectTypeOf<Awaited<ReturnType<typeof pageOfModelRows>>>().toEqualTypeOf<CursorPageResult<ModelRow>>()
  })

  it('reads a hand-written source inside a transaction', () => {
    // A page of a `UNION` inside `$transaction` has to read through the
    // transaction's own client, which is the reason `$from` sits on the reader
    // rather than being imported.
    expectTypeOf<Awaited<ReturnType<typeof sourceInsideTransaction>>>()
      .toEqualTypeOf<CursorPageResult<CustomRow>>()
  })

  it('infers the model\'s row type rather than widening it', () => {
    // `TRow` reaching `unknown` or `any` would leave every acceptance assertion
    // above passing while `page.data[0].title` typed as nothing in particular.
    expectTypeOf<ModelRow>().not.toBeAny()
    expectTypeOf<ModelRow['title']>().toEqualTypeOf<string>()
    expectTypeOf<ModelRow['content']>().toEqualTypeOf<string | null>()
    expectTypeOf<ModelRow['updatedAt']>().toEqualTypeOf<Date>()
  })

  it('still takes a hand-written delegate, which is how a UNION is paged', () => {
    expectTypeOf<Awaited<ReturnType<typeof pageOfDeclaredDelegate>>>().toEqualTypeOf<CursorPageResult<CustomRow>>()
    expectTypeOf<Awaited<ReturnType<typeof pageOfLooseDelegate>>>().toEqualTypeOf<CursorPageResult<CustomRow>>()
    expectTypeOf<Awaited<ReturnType<typeof pageOfPreciseDelegate>>>().toEqualTypeOf<CursorPageResult<CustomRow>>()
  })

  it('gives the page the delegate\'s own row type, not an index signature', () => {
    type Row = Awaited<ReturnType<typeof pageOfDeclaredDelegate>>['data'][number]

    expectTypeOf<Row>().not.toBeAny()
    expectTypeOf<Row['title']>().toEqualTypeOf<string>()
    expectTypeOf<Row['updatedAt']>().toEqualTypeOf<string>()
  })

  it('orders only on columns the delegate\'s rows carry', () => {
    // A cursor is built from the ordering values of a returned row, so ordering
    // on a column the query does not return raises `CursorOrderingError` once
    // the first row comes back. Keying the ordering to the row moves that to
    // compile time. The row constraint obliges a caller to write
    // `extends Record<string, unknown>`, whose index signature would otherwise
    // make `keyof` `string` and accept anything.
    function unknownColumn() {
      // @ts-expect-error `subject` is not a column of CustomRow
      return db.$cursor.$from(declaredDelegate, { take: 20, orderBy: [{ subject: 'desc' }] })
    }

    function unknownUniqueBy() {
      // @ts-expect-error `subject` is not a column of CustomRow
      return db.$cursor.$from(declaredDelegate, { take: 20, orderBy: ORDER, uniqueBy: 'subject' })
    }

    expect([unknownColumn, unknownUniqueBy]).toHaveLength(2)
  })

  it('does not offer `select`, `omit` or `include`', () => {
    // They are ZenStack model arguments. A caller-written `findMany` decides
    // what it returns, so the framework can neither type them against the row
    // nor make the delegate honour them.
    function selecting() {
      // @ts-expect-error narrow inside your own `findMany` instead
      return db.$cursor.$from(declaredDelegate, { take: 20, orderBy: ORDER, select: { id: true } })
    }

    function omitting() {
      // @ts-expect-error narrow inside your own `findMany` instead
      return db.$cursor.$from(declaredDelegate, { take: 20, orderBy: ORDER, omit: { title: true } })
    }

    function including() {
      // @ts-expect-error narrow inside your own `findMany` instead
      return db.$cursor.$from(declaredDelegate, { take: 20, orderBy: ORDER, include: { author: true } })
    }

    expect([selecting, omitting, including]).toHaveLength(3)
  })
})

describe('$from delegate refusal', () => {
  it('refuses something that is not a delegate', () => {
    const notADelegate = { findMany: (_args: Record<string, unknown>) => Promise.resolve('rows') }

    function refused() {
      // @ts-expect-error `findMany` has to resolve to an array of rows
      return db.$cursor.$from(notADelegate, { take: 20, orderBy: ORDER })
    }

    expect(refused).toBeTypeOf('function')
  })

  it('refuses a delegate whose rows cannot carry cursor values', () => {
    const scalarRows = { findMany: (_args: Record<string, unknown>) => Promise.resolve([1, 2, 3]) }

    function refused() {
      // @ts-expect-error rows have to be objects — a cursor is built from a row's columns
      return db.$cursor.$from(scalarRows, { take: 20, orderBy: ORDER })
    }

    expect(refused).toBeTypeOf('function')
  })
})

describe('db.$cursor reader', () => {
  it('reads a page of a model and types its rows and its cursors', () => {
    type Page = Awaited<ReturnType<typeof pageThroughReader>>

    expectTypeOf<Page>().toEqualTypeOf<CursorPageResult<ModelRow>>()
    expectTypeOf<Page['data'][number]>().not.toBeAny()
    expectTypeOf<Page['data'][number]['title']>().toEqualTypeOf<string>()
    expectTypeOf<Page['nextCursor']>().toEqualTypeOf<string | null>()
    expectTypeOf<Page['prevCursor']>().toEqualTypeOf<string | null>()
  })

  it('types `where` against the model', () => {
    const invalid: ReaderArgs = {
      take: 20,
      orderBy: [{ id: 'desc' }],
      // @ts-expect-error `noSuchColumn` is not a column of Post
      where: { noSuchColumn: true },
    }

    expect(invalid).toBeDefined()
  })

  it('orders only on the model\'s own columns, only asc or desc', () => {
    const unknownColumn: ReaderArgs = {
      take: 20,
      // @ts-expect-error a cursor cannot be built from a column the model does not have
      orderBy: [{ noSuchColumn: 'desc' }],
    }

    const unknownDirection: ReaderArgs = {
      take: 20,
      // @ts-expect-error an ordering needs a direction
      orderBy: [{ id: 'sideways' }],
    }

    expect([unknownColumn, unknownDirection]).toHaveLength(2)
  })

  it('leaves ZenStack\'s own offset-cursor arguments unreachable', () => {
    // The whole reason `$cursor` is a namespace instead of an argument on the
    // model's own `findMany`: ZenStack's `cursor` resolves a row by unique id at
    // query time and answers an empty page once that row is gone, skips a row
    // once the query's `where` excludes it, and repeats one once its ordering
    // column moves. Two arguments spelled `cursor` on one call is the trap this
    // omission removes.
    const nativeCursor: ReaderArgs = {
      take: 20,
      orderBy: [{ id: 'desc' }],
      // @ts-expect-error ZenStack's offset `cursor` is not reachable in this namespace
      cursor: { id: 'abc' },
    }

    const offset: ReaderArgs = {
      take: 20,
      orderBy: [{ id: 'desc' }],
      // @ts-expect-error `skip` addresses a place in a result set, which a cursor does not
      skip: 1,
    }

    const distinct: ReaderArgs = {
      take: 20,
      orderBy: [{ id: 'desc' }],
      // @ts-expect-error `distinct` changes which row represents a group, so no row has a stable position
      distinct: ['title'],
    }

    expect([nativeCursor, offset, distinct]).toHaveLength(3)

    // And the opaque cursor that replaces it is a string.
    expectTypeOf<ReaderArgs['cursor']>().toEqualTypeOf<string | null | undefined>()
  })

  it('narrows the row type when `select` is given', () => {
    async function selected() {
      return db.$cursor.post.findMany({
        take: 20,
        orderBy: [{ id: 'desc' }],
        select: { id: true, title: true },
      })
    }

    type Row = Awaited<ReturnType<typeof selected>>['data'][number]

    expectTypeOf<Row>().toEqualTypeOf<{ id: string; title: string }>()
  })

  it('takes `omit` or `include` on their own', () => {
    async function omitted() {
      return db.$cursor.post.findMany({ take: 20, orderBy: [{ id: 'desc' }], omit: { content: true } })
    }
    async function included() {
      return db.$cursor.post.findMany({ take: 20, orderBy: [{ id: 'desc' }], include: { author: true } })
    }

    // `omit` drops the named column and leaves the rest.
    expectTypeOf<Awaited<ReturnType<typeof omitted>>['data'][number]['title']>().toEqualTypeOf<string>()
    expectTypeOf<Awaited<ReturnType<typeof included>>['data'][number]['title']>().toEqualTypeOf<string>()
  })

  it('refuses `select` together with `omit` or `include`', () => {
    // ZenStack's own `findMany` refuses both pairings through `SelectSubset`,
    // which resolves the argument to its message. Rebuilding the argument type
    // without passing it back through `SelectSubset` drops that guard silently,
    // and the mistake then survives to a runtime validation error instead.
    // The exclusion is conditional on the actual argument, so it only shows at a
    // call — an assignment to the parameter type instantiates the generic at its
    // constraint and never reaches the condition. These are declared and never
    // called; `db` has no runtime value here.
    function selectWithOmit() {
      // @ts-expect-error Please either choose `select` or `omit`.
      return db.$cursor.post.findMany({
        take: 20,
        orderBy: [{ id: 'desc' }],
        select: { id: true },
        omit: { title: true },
      })
    }

    function selectWithInclude() {
      // @ts-expect-error Please either choose `select` or `include`.
      return db.$cursor.post.findMany({
        take: 20,
        orderBy: [{ id: 'desc' }],
        select: { id: true },
        include: { author: true },
      })
    }

    expect([selectWithOmit, selectWithInclude]).toHaveLength(2)
  })

  it('covers every model in the schema', () => {
    expectTypeOf<keyof DatabaseService['$cursor']>()
      .toEqualTypeOf<'user' | 'session' | 'account' | 'verification' | 'post' | '$from'>()
  })

  it('is the same reader on a transaction client as on the base client', () => {
    // ZenStack types the callback with its own `TransactionClientContract`,
    // which knows nothing of the members this package defines. Without the
    // restated `$transaction`, `tx.$cursor` does not exist and a paginated read
    // inside a transaction needs a different API from one outside it.
    expectTypeOf<TransactionService['$cursor']>().toEqualTypeOf<DatabaseService['$cursor']>()

    expectTypeOf<Parameters<typeof db.$cursor.post.findMany>[0]>()
      .toEqualTypeOf<Parameters<TransactionService['$cursor']['post']['findMany']>[0]>()

    expectTypeOf<Awaited<ReturnType<typeof readerInsideTransaction>>>()
      .toEqualTypeOf<Awaited<ReturnType<typeof pageThroughReader>>>()
  })

  it('leaves the sequential form of $transaction typed', () => {
    // The interactive overload is restated to carry the built-in members; the
    // array overload has to keep resolving each element's own row type.
    async function sequential() {
      return db.$transaction([db.post.findMany({ take: 1 }), db.user.findMany({ take: 1 })])
    }

    type Results = Awaited<ReturnType<typeof sequential>>

    expectTypeOf<Results[0][number]['title']>().toEqualTypeOf<string>()
    expectTypeOf<Results[1][number]['email']>().toEqualTypeOf<string>()
  })
})
