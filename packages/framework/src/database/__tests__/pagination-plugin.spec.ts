import { describe, expect, it, vi } from 'vitest'
import { type ResourceClientExtension } from '../database.service'
import { paginationPlugin } from '../plugins/pagination.plugin'

// --- Helpers ---

interface MockDelegate {
  findMany: ReturnType<typeof vi.fn>
  count: ReturnType<typeof vi.fn>
}

function createMockClient(delegates: Record<string, MockDelegate>) {
  const client = { ...delegates }
  const $resource = Object.fromEntries(
    Object.entries(paginationPlugin.client!.$resource).map(([key, fn]) => [
      key,
      (fn as (...args: unknown[]) => unknown).bind(client),
    ]),
  ) as unknown as ResourceClientExtension['$resource']
  return { ...client, $resource }
}

describe('paginationPlugin', () => {
  it('should have the correct plugin id', () => {
    expect(paginationPlugin.id).toBe('pagination')
  })

  describe('$resource.paginate', () => {
    it('should use default page (1) and limit (20)', async () => {
      const user: MockDelegate = {
        findMany: vi.fn().mockResolvedValue([{ id: '1' }]),
        count: vi.fn().mockResolvedValue(1),
      }
      const client = createMockClient({ user })

      const result = await client.$resource.paginate('user')

      expect(user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      )
      expect(result.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 })
    })

    it('should compute correct skip/take for custom page/limit', async () => {
      const user: MockDelegate = {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(50),
      }
      const client = createMockClient({ user })

      const result = await client.$resource.paginate('user', { page: 3, limit: 10 })

      expect(user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      )
      expect(result.pagination).toEqual({ page: 3, limit: 10, total: 50, totalPages: 5 })
    })

    it('should share where between findMany and count', async () => {
      const where = { active: true }
      const user: MockDelegate = {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      }
      const client = createMockClient({ user })

      await client.$resource.paginate('user', { where })

      expect(user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }))
      expect(user.count).toHaveBeenCalledWith({ where })
    })

    it('should pass select, include, omit, orderBy only to findMany', async () => {
      const options = {
        select: { id: true, name: true },
        include: { posts: true },
        omit: { password: true },
        orderBy: { name: 'asc' },
      }
      const user: MockDelegate = {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      }
      const client = createMockClient({ user })

      await client.$resource.paginate('user', options)

      expect(user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: options.select,
          include: options.include,
          omit: options.omit,
          orderBy: options.orderBy,
        }),
      )
      const countArgs = user.count.mock.calls[0][0]
      expect(countArgs).not.toHaveProperty('select')
      expect(countArgs).not.toHaveProperty('include')
      expect(countArgs).not.toHaveProperty('omit')
      expect(countArgs).not.toHaveProperty('orderBy')
    })

    it('should round totalPages up correctly', async () => {
      const user: MockDelegate = {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(21),
      }
      const client = createMockClient({ user })

      const result = await client.$resource.paginate('user', { limit: 10 })
      expect(result.pagination.totalPages).toBe(3)
    })

    it('should return totalPages 0 when total is 0', async () => {
      const user: MockDelegate = {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      }
      const client = createMockClient({ user })

      const result = await client.$resource.paginate('user')
      expect(result.pagination).toEqual({ page: 1, limit: 20, total: 0, totalPages: 0 })
      expect(result.data).toEqual([])
    })

    it('should run findMany and count in parallel', async () => {
      const callOrder: string[] = []
      const user: MockDelegate = {
        findMany: vi.fn().mockImplementation(async () => {
          callOrder.push('findMany:start')
          await new Promise(r => setTimeout(r, 10))
          callOrder.push('findMany:end')
          return []
        }),
        count: vi.fn().mockImplementation(async () => {
          callOrder.push('count:start')
          await new Promise(r => setTimeout(r, 10))
          callOrder.push('count:end')
          return 0
        }),
      }
      const client = createMockClient({ user })

      await client.$resource.paginate('user')

      // Both should start before either finishes
      expect(callOrder.indexOf('findMany:start')).toBeLessThan(callOrder.indexOf('count:end'))
      expect(callOrder.indexOf('count:start')).toBeLessThan(callOrder.indexOf('findMany:end'))
    })
  })

  describe('$resource.cursorPaginate', () => {
    it('should not include cursor/skip when no cursor provided (first page)', async () => {
      const post: MockDelegate = {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn(),
      }
      const client = createMockClient({ post })

      await client.$resource.cursorPaginate('post')

      const args = post.findMany.mock.calls[0][0]
      expect(args.cursor).toBeUndefined()
      expect(args.skip).toBeUndefined()
      expect(args.take).toBe(21) // limit + 1
    })

    it('should add cursor object and skip:1 when cursor is provided', async () => {
      const post: MockDelegate = {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn(),
      }
      const client = createMockClient({ post })

      await client.$resource.cursorPaginate('post', { cursor: 'abc-123' })

      const args = post.findMany.mock.calls[0][0]
      expect(args.cursor).toEqual({ id: 'abc-123' })
      expect(args.skip).toBe(1)
    })

    it('should return hasMore=true and trim data when limit+1 items returned', async () => {
      const items = Array.from({ length: 21 }, (_, i) => ({ id: `item-${i}` }))
      const post: MockDelegate = {
        findMany: vi.fn().mockResolvedValue(items),
        count: vi.fn(),
      }
      const client = createMockClient({ post })

      const result = await client.$resource.cursorPaginate('post')

      expect(result.hasMore).toBe(true)
      expect(result.data).toHaveLength(20)
      expect(result.nextCursor).toBe('item-19')
    })

    it('should return hasMore=false when fewer items than limit+1', async () => {
      const items = [{ id: 'item-1' }, { id: 'item-2' }]
      const post: MockDelegate = {
        findMany: vi.fn().mockResolvedValue(items),
        count: vi.fn(),
      }
      const client = createMockClient({ post })

      const result = await client.$resource.cursorPaginate('post', { limit: 10 })

      expect(result.hasMore).toBe(false)
      expect(result.data).toHaveLength(2)
      expect(result.nextCursor).toBeNull()
    })

    it('should use custom cursorField', async () => {
      const items = Array.from({ length: 6 }, (_, i) => ({ slug: `post-${i}` }))
      const post: MockDelegate = {
        findMany: vi.fn().mockResolvedValue(items),
        count: vi.fn(),
      }
      const client = createMockClient({ post })

      const result = await client.$resource.cursorPaginate('post', {
        limit: 5,
        cursor: 'post-0',
        cursorField: 'slug',
      })

      const args = post.findMany.mock.calls[0][0]
      expect(args.cursor).toEqual({ slug: 'post-0' })
      expect(result.hasMore).toBe(true)
      expect(result.nextCursor).toBe('post-4')
    })

    it('should use default limit of 20', async () => {
      const post: MockDelegate = {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn(),
      }
      const client = createMockClient({ post })

      const result = await client.$resource.cursorPaginate('post')

      expect(post.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 21 }))
      expect(result.limit).toBe(20)
    })

    it('should include limit in result for ctx.cursorCollection() consumption', async () => {
      const post: MockDelegate = {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn(),
      }
      const client = createMockClient({ post })

      const result = await client.$resource.cursorPaginate('post', { limit: 15 })

      expect(result.limit).toBe(15)
    })

    it('should pass where, select, include, omit, orderBy to findMany', async () => {
      const options = {
        where: { published: true },
        select: { id: true, title: true },
        include: { author: true },
        omit: { content: true },
        orderBy: { createdAt: 'desc' },
      }
      const post: MockDelegate = {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn(),
      }
      const client = createMockClient({ post })

      await client.$resource.cursorPaginate('post', options)

      expect(post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: options.where,
          select: options.select,
          include: options.include,
          omit: options.omit,
          orderBy: options.orderBy,
        }),
      )
    })

    it('should return null nextCursor when data is empty', async () => {
      const post: MockDelegate = {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn(),
      }
      const client = createMockClient({ post })

      const result = await client.$resource.cursorPaginate('post')

      expect(result.nextCursor).toBeNull()
      expect(result.hasMore).toBe(false)
    })
  })
})
