import { Test, type TestingModule } from '@stratal/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { CursorFindManyArgs, CursorPageResult } from '../../src/database/pagination/cursor'
import { PostFactory } from '../factories/post.factory'
import { UserFactory } from '../factories/user.factory'
import { TestAppModule } from '../fixtures/app.module'
import type { Post } from '../zenstack/models'

/**
 * `db.$cursor` against real Postgres, on the three ways a list changes under a
 * reader. Each is a case ZenStack's own `cursor?: WhereUniqueInput` answers
 * wrongly and silently — it resolves the row's ordering values by subquery at
 * query time, so the row must still exist, still pass the query's `where`, and
 * still hold the values it held when the cursor was minted. None of that is
 * true of a list that is being written to.
 */
describe('Cursor pagination against a changing list', () => {
  let module: TestingModule
  let authorId: string

  /** Two posts tie on `updatedAt`, and the tie straddles the page boundary. */
  const DAYS: Record<string, number> = { pa: 1, pb: 2, pc: 4, pd: 4, pe: 5 }
  const ORDER = [{ updatedAt: 'desc' as const }, { id: 'desc' as const }]

  const at = (day: number) => new Date(Date.UTC(2026, 0, day))

  beforeAll(async () => {
    module = await Test.createTestingModule({ imports: [TestAppModule] }).compile()
  })

  afterAll(async () => {
    await module.close()
  })

  beforeEach(async () => {
    await module.truncateDb()

    const db = module.getDb()
    const author = await new UserFactory().create(db)
    authorId = author.id

    for (const [id, day] of Object.entries(DAYS)) {
      await new PostFactory()
        .forAuthor(authorId)
        .state(() => ({ id, title: `post ${id}` }))
        .create(db)
      // `@updatedAt` overwrites on write, so pin the ordering column afterwards.
      await db.post.update({ where: { id }, data: { updatedAt: at(day) } })
    }
  })

  const idsOf = (page: { data: { id: string }[] }) => page.data.map((row) => row.id)

  it('walks the whole list without skipping or repeating a tied row', async () => {
    const db = module.getDb()
    const seen: string[] = []
    let cursor: string | null = null

    for (let request = 0; request < 5; request++) {
      // Annotated so the page's type does not depend on the cursor it produces.
      const page: CursorPageResult<Post> =
        // Relating the reader's row to the generated model type walks both through every field and
        // relation, which ZenStack's own types carry past the checker's comparison depth. The two
        // describe the same row, and TypeScript 6 relates them without complaint.
        // @ts-expect-error -- flatten those types upstream and this suppression fails.
        await db.$cursor.post.findMany({
          where: { authorId }, orderBy: ORDER, take: 2, cursor,
        })
      seen.push(...idsOf(page))
      cursor = page.nextCursor
      if (!cursor) break
    }

    expect(seen).toEqual(['pe', 'pd', 'pc', 'pb', 'pa'])
    expect(cursor).toBeNull()
  })

  it('still resolves a cursor whose row has been deleted', async () => {
    const db = module.getDb()

    const first = await db.$cursor.post.findMany({ where: { authorId }, orderBy: ORDER, take: 2 })
    expect(idsOf(first)).toEqual(['pe', 'pd'])

    // `pd` is the row the cursor was built from.
    await db.post.delete({ where: { id: 'pd' } })

    const second = await db.$cursor.post.findMany({
      where: { authorId }, orderBy: ORDER, take: 2, cursor: first.nextCursor,
    })

    // Native `cursor` answers an empty page here: its subqueries resolve to
    // NULL, so the whole predicate is NULL and nothing matches.
    expect(idsOf(second)).toEqual(['pc', 'pb'])
  })

  it('still resolves a cursor whose row the next request filters out', async () => {
    const db = module.getDb()

    const first = await db.$cursor.post.findMany({ where: { authorId }, orderBy: ORDER, take: 2 })
    expect(idsOf(first)).toEqual(['pe', 'pd'])

    // The reader narrows the list between requests — a status filter, a search
    // term — and the narrowing excludes the row the cursor names.
    const second = await db.$cursor.post.findMany({
      where: { authorId, id: { not: 'pd' } }, orderBy: ORDER, take: 2, cursor: first.nextCursor,
    })

    // Native `cursor` skips `pc` here: it pairs the keyset window with a real
    // SQL `OFFSET 1`, which drops the first row of the window on the assumption
    // that the cursor row is still in it.
    expect(idsOf(second)).toEqual(['pc', 'pb'])
  })

  it('still resolves a cursor whose row has since moved in the ordering', async () => {
    const db = module.getDb()

    const first = await db.$cursor.post.findMany({ where: { authorId }, orderBy: ORDER, take: 2 })
    expect(idsOf(first)).toEqual(['pe', 'pd'])

    // `pd` is touched between requests and sorts to the top — the ordinary case
    // for an "most recently active first" list.
    await db.post.update({ where: { id: 'pd' }, data: { updatedAt: at(7) } })

    const second = await db.$cursor.post.findMany({
      where: { authorId }, orderBy: ORDER, take: 2, cursor: first.nextCursor,
    })

    // Native `cursor` re-reads `pd`'s current position, so "after pd" becomes
    // the top of the list again: it repeats `pe` and skips `pd`. The cursor
    // carries the ordering values instead, so the position does not move.
    expect(idsOf(second)).toEqual(['pc', 'pb'])
  })

  it('reads backwards from a cursor and returns rows in display order', async () => {
    const db = module.getDb()

    const first = await db.$cursor.post.findMany({ where: { authorId }, orderBy: ORDER, take: 2 })
    const second = await db.$cursor.post.findMany({
      where: { authorId }, orderBy: ORDER, take: 2, cursor: first.nextCursor,
    })
    const back = await db.$cursor.post.findMany({
      where: { authorId }, orderBy: ORDER, take: 2, cursor: second.prevCursor,
    })

    expect(idsOf(back)).toEqual(['pe', 'pd'])
    expect(back.prevCursor).toBeNull()
    expect(back.nextCursor).not.toBeNull()
  })

  it('reads a page inside a transaction, from the transaction\'s own client', async () => {
    const db = module.getDb()

    const pages = await db.$transaction(async (tx) => {
      const one = await tx.$cursor.post.findMany({ where: { authorId }, orderBy: ORDER, take: 2 })
      // A write made inside the transaction is visible to the next page read,
      // which is what shows the read went through the transaction's client
      // rather than a second connection outside it.
      await tx.post.delete({ where: { id: 'pc' } })
      const two = await tx.$cursor.post.findMany({
        where: { authorId }, orderBy: ORDER, take: 2, cursor: one.nextCursor,
      })
      return { one, two }
    })

    expect(idsOf(pages.one)).toEqual(['pe', 'pd'])
    expect(idsOf(pages.two)).toEqual(['pb', 'pa'])
  })

  it('pages a hand-written source through `$from`', async () => {
    const db = module.getDb()

    // Stands in for a `UNION` or a raw statement: the framework cannot build
    // the query, so the caller supplies `findMany` and the paginator supplies
    // the keyset condition, the ordering and the extra row.
    const union = {
      findMany: (args: CursorFindManyArgs) => db.post.findMany({ ...args, where: { ...args.where, authorId } }),
    }

    const first = await db.$cursor.$from(union, { orderBy: ORDER, take: 2 })
    const second = await db.$cursor.$from(union, { orderBy: ORDER, take: 2, cursor: first.nextCursor })

    expect(idsOf(first)).toEqual(['pe', 'pd'])
    expect(idsOf(second)).toEqual(['pc', 'pb'])
  })

  it('pages a hand-written source inside a transaction, through the transaction\'s client', async () => {
    const db = module.getDb()

    const pages = await db.$transaction(async (tx) => {
      const union = {
        findMany: (args: CursorFindManyArgs) => tx.post.findMany({ ...args, where: { ...args.where, authorId } }),
      }

      const one = await tx.$cursor.$from(union, { orderBy: ORDER, take: 2 })
      // Written inside the transaction, so only a read on the transaction's own
      // client can see it.
      await tx.post.delete({ where: { id: 'pc' } })
      const two = await tx.$cursor.$from(union, { orderBy: ORDER, take: 2, cursor: one.nextCursor })

      return { one, two }
    })

    expect(idsOf(pages.one)).toEqual(['pe', 'pd'])
    expect(idsOf(pages.two)).toEqual(['pb', 'pa'])
  })

  it('narrows the returned rows when `select` is given', async () => {
    const db = module.getDb()

    const page = await db.$cursor.post.findMany({
      where: { authorId },
      orderBy: ORDER,
      take: 2,
      select: { id: true, updatedAt: true },
    })

    expect(Object.keys(page.data[0]).sort()).toEqual(['id', 'updatedAt'])
  })

  it('refuses a cursor that did not come from a page', async () => {
    const db = module.getDb()

    await expect(
      db.$cursor.post.findMany({ where: { authorId }, orderBy: ORDER, take: 2, cursor: 'hand-edited' }),
    ).rejects.toMatchObject({ httpStatus: 400 })
  })
})
