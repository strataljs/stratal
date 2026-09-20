import { describe, expect, it, vi } from 'vitest'
import { ApplicationError } from 'stratal/errors'
import type { SchemaDef } from '@zenstackhq/orm/schema'
import { CursorModelUnavailableError } from '../errors/cursor-model-unavailable.error'
import { CursorOrderingError } from '../errors/cursor-ordering.error'
import { createCursorReader } from '../pagination/cursor-reader'
import { MalformedCursorError } from '../errors/malformed-cursor.error'
import {
  readCursorPage,
  decodeCursor,
  encodeCursor,
  type CursorPageArgs,
  type CursorPageDelegate,
  type CursorPageResult,
} from '../pagination/cursor'

interface Row extends Record<string, unknown> {
  id: string
  updatedAt: string
  title: string
}

/**
 * An in-memory table that answers `findMany` the way Postgres would for the
 * subset of the query shape the paginator builds — `where` as an `AND` of an
 * outer filter and the keyset `OR`, multi-column `orderBy`, and `take`.
 *
 * Written out rather than stubbed with canned rows because the keyset condition
 * IS the thing under test: a stub returning fixed pages would pass whatever
 * condition the paginator produced, including a wrong one.
 */
function table(rows: Row[]): CursorPageDelegate<Row> & { calls: Record<string, unknown>[] } {
  const calls: Record<string, unknown>[] = []

  const matches = (row: Row, condition: Record<string, unknown>): boolean => {
    return Object.entries(condition).every(([key, value]) => {
      if (key === 'AND') return (value as Record<string, unknown>[]).every((c) => matches(row, c))
      if (key === 'OR') return (value as Record<string, unknown>[]).some((c) => matches(row, c))

      if (value !== null && typeof value === 'object') {
        return Object.entries(value as Record<string, unknown>).every(([op, operand]) => {
          if (op === 'lt') return (row[key] as string) < (operand as string)
          if (op === 'gt') return (row[key] as string) > (operand as string)
          throw new Error(`unsupported operator ${op}`)
        })
      }

      return row[key] === value
    })
  }

  return {
    calls,
    findMany(args: Record<string, unknown>) {
      calls.push(args)

      const where = args.where as Record<string, unknown> | undefined
      const orderBy = (args.orderBy ?? []) as Record<string, 'asc' | 'desc'>[]
      const take = args.take as number

      const filtered = where ? rows.filter((row) => matches(row, where)) : [...rows]

      filtered.sort((a, b) => {
        for (const clause of orderBy) {
          const [field, direction] = Object.entries(clause)[0]
          const left = a[field] as string
          const right = b[field] as string
          if (left === right) continue
          return (left < right ? -1 : 1) * (direction === 'asc' ? 1 : -1)
        }
        return 0
      })

      return Promise.resolve(filtered.slice(0, take))
    },
  }
}

/** Five threads, two of them tied on `updatedAt` — the case an id tie-break exists for. */
const THREADS: Row[] = [
  { id: 'e', updatedAt: '2026-01-05T00:00:00.000Z', title: 'newest' },
  { id: 'd', updatedAt: '2026-01-04T00:00:00.000Z', title: 'tied-later-id' },
  { id: 'c', updatedAt: '2026-01-04T00:00:00.000Z', title: 'tied-earlier-id' },
  { id: 'b', updatedAt: '2026-01-02T00:00:00.000Z', title: 'older' },
  { id: 'a', updatedAt: '2026-01-01T00:00:00.000Z', title: 'oldest' },
]

const ACTIVITY_ORDER: CursorPageArgs['orderBy'] = [{ updatedAt: 'desc' }, { id: 'desc' }]

describe('readCursorPage', () => {
  it('returns the first page with no cursor and a next cursor', async () => {
    const db = table(THREADS)

    const page = await readCursorPage(db, { take: 2, orderBy: ACTIVITY_ORDER })

    expect(page.data.map((r) => r.id)).toEqual(['e', 'd'])
    expect(page.cursor).toBeNull()
    expect(page.prevCursor).toBeNull()
    expect(page.nextCursor).not.toBeNull()
    expect(page.perPage).toBe(2)
    expect(page.cursorName).toBe('cursor')
  })

  it('asks for one row more than the page size, which is how the next page is known', async () => {
    const db = table(THREADS)

    await readCursorPage(db, { take: 2, orderBy: ACTIVITY_ORDER })

    expect(db.calls[0].take).toBe(3)
  })

  it('walks forward without skipping or repeating a row', async () => {
    const db = table(THREADS)
    const seen: string[] = []

    let cursor: string | null = null
    for (let i = 0; i < 5; i++) {
      const page: CursorPageResult<Row> = await readCursorPage(db, { cursor, take: 2, orderBy: ACTIVITY_ORDER })
      seen.push(...page.data.map((r) => r.id))
      cursor = page.nextCursor
      if (!cursor) break
    }

    expect(seen).toEqual(['e', 'd', 'c', 'b', 'a'])
    expect(cursor).toBeNull()
  })

  it('separates rows tied on the leading column by the unique one', async () => {
    const db = table(THREADS)

    const first = await readCursorPage(db, { take: 2, orderBy: ACTIVITY_ORDER })
    // The page boundary falls between `d` and `c`, which share an `updatedAt`.
    const second = await readCursorPage(db, { cursor: first.nextCursor, take: 2, orderBy: ACTIVITY_ORDER })

    expect(first.data.map((r) => r.id)).toEqual(['e', 'd'])
    expect(second.data.map((r) => r.id)).toEqual(['c', 'b'])
  })

  it('does not skip a row when one is inserted above the window', async () => {
    const rows = [...THREADS]
    const db = table(rows)

    const first = await readCursorPage(db, { take: 2, orderBy: ACTIVITY_ORDER })
    // A student asks a new question between requests; it sorts to the top.
    rows.push({ id: 'f', updatedAt: '2026-01-06T00:00:00.000Z', title: 'brand new' })

    const second = await readCursorPage(db, { cursor: first.nextCursor, take: 2, orderBy: ACTIVITY_ORDER })

    // An offset paginator would have returned `d` again here, having shifted by one.
    expect(second.data.map((r) => r.id)).toEqual(['c', 'b'])
  })

  it('still resolves a cursor whose row has been deleted', async () => {
    const rows = [...THREADS]
    const db = table(rows)

    const first = await readCursorPage(db, { take: 2, orderBy: ACTIVITY_ORDER })
    // `d` is the row the cursor was built from.
    rows.splice(rows.findIndex((r) => r.id === 'd'), 1)

    const second = await readCursorPage(db, { cursor: first.nextCursor, take: 2, orderBy: ACTIVITY_ORDER })

    expect(second.data.map((r) => r.id)).toEqual(['c', 'b'])
  })

  it('reads backwards and returns the rows in display order', async () => {
    const db = table(THREADS)

    const first = await readCursorPage(db, { take: 2, orderBy: ACTIVITY_ORDER })
    const second = await readCursorPage(db, { cursor: first.nextCursor, take: 2, orderBy: ACTIVITY_ORDER })
    const back = await readCursorPage(db, { cursor: second.prevCursor, take: 2, orderBy: ACTIVITY_ORDER })

    expect(second.prevCursor).not.toBeNull()
    expect(back.data.map((r) => r.id)).toEqual(['e', 'd'])
    // Having walked back to the top, there is nothing before it, but there is after.
    expect(back.prevCursor).toBeNull()
    expect(back.nextCursor).not.toBeNull()
  })

  it('combines the caller\'s filter with the cursor condition', async () => {
    const db = table(THREADS)

    const first = await readCursorPage(db, {
      take: 1,
      orderBy: ACTIVITY_ORDER,
      where: { title: 'tied-later-id' },
    })

    expect(first.data.map((r) => r.id)).toEqual(['d'])
    expect(db.calls[0].where).toEqual({ title: 'tied-later-id' })
  })

  it('closes both ends for an empty result', async () => {
    const db = table([])

    const page = await readCursorPage(db, { take: 2, orderBy: ACTIVITY_ORDER })

    expect(page.data).toEqual([])
    expect(page.nextCursor).toBeNull()
    expect(page.prevCursor).toBeNull()
  })

  it('honours a custom cursor name', async () => {
    const db = table(THREADS)

    const page = await readCursorPage(db, { take: 2, orderBy: ACTIVITY_ORDER, cursorName: 'thread_cursor' })

    expect(page.cursorName).toBe('thread_cursor')
  })

  it('passes include and select through', async () => {
    const db = table(THREADS)

    await readCursorPage(db, {
      take: 2,
      orderBy: ACTIVITY_ORDER,
      include: { author: true },
      select: undefined,
    })

    expect(db.calls[0].include).toEqual({ author: true })
    expect(db.calls[0]).not.toHaveProperty('select')
  })

  describe('constraints', () => {
    it('throws when the ordering is empty', async () => {
      const db = table(THREADS)

      await expect(readCursorPage(db, { take: 2, orderBy: [] }))
        .rejects.toThrow(CursorOrderingError)
    })

    it('throws when the ordering has no unique component', async () => {
      const db = table(THREADS)

      await expect(readCursorPage(db, { take: 2, orderBy: { updatedAt: 'desc' } }))
        .rejects.toThrow(CursorOrderingError)
    })

    it('names a different unique column when asked', async () => {
      const db = table(THREADS)

      const page = await readCursorPage(db, {
        take: 2,
        orderBy: [{ updatedAt: 'desc' }, { title: 'desc' }],
        uniqueBy: 'title',
      })

      expect(page.data.map((r) => r.id)).toEqual(['e', 'd'])
    })

    it('throws when an ordering column is missing from the returned row', async () => {
      const db: CursorPageDelegate<Row> = {
        findMany: vi.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]),
      }

      await expect(readCursorPage(db, { take: 2, orderBy: ACTIVITY_ORDER }))
        .rejects.toThrow(CursorOrderingError)
    })

    it('throws when an ordering column is null', async () => {
      const db: CursorPageDelegate<Row> = {
        findMany: vi.fn().mockResolvedValue([
          { id: 'a', updatedAt: null, title: 'x' },
          { id: 'b', updatedAt: null, title: 'y' },
          { id: 'c', updatedAt: null, title: 'z' },
        ]),
      }

      await expect(readCursorPage(db, { take: 2, orderBy: ACTIVITY_ORDER }))
        .rejects.toThrow(CursorOrderingError)
    })

    it('throws on a malformed cursor', async () => {
      const db = table(THREADS)

      await expect(readCursorPage(db, { cursor: 'not-a-cursor', take: 2, orderBy: ACTIVITY_ORDER }))
        .rejects.toThrow(MalformedCursorError)
    })

    it('separates bad input from a misconfigured query, so a caller can answer them differently', async () => {
      // The whole reason these are two classes. A cursor arriving from a query
      // string is answerable — serve the first page — while an ordering the
      // caller wrote wrong is not, and telling them apart must not require
      // matching on message text.
      const db = table(THREADS)

      const badInput: unknown = await readCursorPage(db, { cursor: '!!', take: 2, orderBy: ACTIVITY_ORDER })
        .catch((error: unknown) => error)
      const badQuery: unknown = await readCursorPage(db, { take: 2, orderBy: [] })
        .catch((error: unknown) => error)

      expect(badInput).toBeInstanceOf(MalformedCursorError)
      expect(badInput).not.toBeInstanceOf(CursorOrderingError)
      // Carries a status, because the request is still answerable.
      expect((badInput as MalformedCursorError).httpStatus).toBe(400)

      expect(badQuery).toBeInstanceOf(CursorOrderingError)
      expect(badQuery).not.toBeInstanceOf(MalformedCursorError)
      // No status: nothing the client sent caused it, so it must not read as 4xx.
      expect(badQuery).not.toHaveProperty('httpStatus')
    })

    it('reports the ordering column at fault to observability', async () => {
      const db: CursorPageDelegate<Row> = {
        findMany: vi.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]),
      }

      const error = await readCursorPage(db, { take: 2, orderBy: ACTIVITY_ORDER })
        .catch((caught: unknown) => caught) as CursorOrderingError

      // Keeps the raise sites distinguishable without a class per site.
      expect(error.field).toBe('updatedAt')
      expect(error.reportContext()).toEqual({ field: 'updatedAt' })
    })
  })

  describe('reaching a model the client does not answer for', () => {
    /** A client that answers for no model, against a schema that declares one. */
    const readerOverEmptyClient = () => createCursorReader({}, { models: { Thread: {} } } as unknown as SchemaDef) as unknown as {
      thread: { findMany: (args: unknown) => unknown }
    }

    it('raises a reportable programming error rather than a bare Error', () => {
      const read = () => readerOverEmptyClient().thread.findMany({ take: 2, orderBy: [{ id: 'desc' }] })

      expect(read).toThrow(CursorModelUnavailableError)

      const error = (() => {
        try {
          read()
        } catch (caught) {
          return caught as CursorModelUnavailableError
        }
        throw new Error('expected a throw')
      })()

      expect(error).toBeInstanceOf(ApplicationError)
      // No status: nothing the client sent caused it, so it must not read as 4xx.
      expect(error).not.toHaveProperty('httpStatus')
      // Keeps the raise site distinguishable without matching on message text.
      expect(error.model).toBe('thread')
      expect(error.reportContext()).toEqual({ model: 'thread' })
    })
  })

  describe('cursor encoding', () => {
    it('round-trips the whole ordering tuple and the direction', () => {
      const encoded = encodeCursor({ updatedAt: '2026-01-04T00:00:00.000Z', id: 'd' }, 'next')

      expect(decodeCursor(encoded)).toEqual({
        values: { updatedAt: '2026-01-04T00:00:00.000Z', id: 'd' },
        direction: 'next',
      })
    })

    it('round-trips a backward cursor', () => {
      expect(decodeCursor(encodeCursor({ id: 'a' }, 'prev')).direction).toBe('prev')
    })

    it('is safe to put in a query string', () => {
      const encoded = encodeCursor({ updatedAt: '2026-01-04T00:00:00.000Z', id: 'd/e+f' }, 'next')

      expect(encoded).toBe(encodeURIComponent(encoded))
    })

    // An ordering column is whatever the caller ordered by, so its value is not
    // ASCII by construction — a title or a name carries whatever the row holds.
    // `btoa` takes Latin-1 only, and a first page mints no cursor, so without the
    // UTF-8 round trip this throws only on the follow-up request.
    it.each([
      ['CJK', '日本語のタイトル'],
      ['Cyrillic', 'Заголовок'],
      ['an emoji', 'Chapter 1 🎓'],
      ['a combining accent', 'Amélie'],
    ])('round-trips %s in an ordering value', (_name, title) => {
      const values = { title, id: '01JQZ' }

      expect(decodeCursor(encodeCursor(values, 'next')).values).toEqual(values)
    })

    it('keeps a cursor carrying non-ASCII safe in a query string', () => {
      const encoded = encodeCursor({ title: '日本語', id: 'a' }, 'next')

      expect(encoded).toBe(encodeURIComponent(encoded))
    })
  })
})
