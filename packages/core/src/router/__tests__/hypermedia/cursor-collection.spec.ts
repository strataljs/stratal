import { describe, expect, it } from 'vitest'
import type { CursorPaginationResult } from '../../hypermedia/types'
import { RouterContext } from '../../router-context'

// --- Helpers ---

function createMockRouterContext(url: string): RouterContext {
  return new RouterContext({
    req: { url },
    json: (body: unknown, status?: number) => {
      return { body, status } as unknown as Response
    },
  } as never)
}

function parseResponse(response: Response): { body: Record<string, unknown>; status?: number } {
  return response as unknown as { body: Record<string, unknown>; status?: number }
}

describe('RouterContext.cursorCollection()', () => {
  it('should generate self link from current URL', () => {
    const ctx = createMockRouterContext('http://localhost:8787/api/posts')
    const result: CursorPaginationResult = {
      data: [{ id: '1' }],
      nextCursor: null,
      hasMore: false,
      limit: 20,
    }

    const response = parseResponse(ctx.cursorCollection(result))

    expect(response.body._links).toEqual(
      expect.objectContaining({
        self: { href: '/api/posts?limit=20' },
      }),
    )
  })

  it('should generate next link when hasMore is true', () => {
    const ctx = createMockRouterContext('http://localhost:8787/api/posts')
    const result: CursorPaginationResult = {
      data: [{ id: '1' }, { id: '2' }],
      nextCursor: 'abc-123',
      hasMore: true,
      limit: 20,
    }

    const response = parseResponse(ctx.cursorCollection(result))

    expect(response.body._links).toEqual(
      expect.objectContaining({
        self: { href: '/api/posts?limit=20' },
        next: { href: '/api/posts?cursor=abc-123&limit=20' },
      }),
    )
  })

  it('should not include next link when hasMore is false', () => {
    const ctx = createMockRouterContext('http://localhost:8787/api/posts')
    const result: CursorPaginationResult = {
      data: [{ id: '1' }],
      nextCursor: null,
      hasMore: false,
      limit: 10,
    }

    const response = parseResponse(ctx.cursorCollection(result))

    expect(response.body._links).not.toHaveProperty('next')
  })

  it('should include hasMore and nextCursor in _meta', () => {
    const ctx = createMockRouterContext('http://localhost:8787/api/posts')
    const result: CursorPaginationResult = {
      data: [],
      nextCursor: 'xyz-456',
      hasMore: true,
      limit: 20,
    }

    const response = parseResponse(ctx.cursorCollection(result))

    expect(response.body._meta).toEqual(
      expect.objectContaining({
        hasMore: true,
        nextCursor: 'xyz-456',
      }),
    )
  })

  it('should omit nextCursor from _meta when null', () => {
    const ctx = createMockRouterContext('http://localhost:8787/api/posts')
    const result: CursorPaginationResult = {
      data: [],
      nextCursor: null,
      hasMore: false,
      limit: 20,
    }

    const response = parseResponse(ctx.cursorCollection(result))

    expect(response.body._meta).toEqual(
      expect.objectContaining({ hasMore: false }),
    )
    expect(response.body._meta).not.toHaveProperty('nextCursor')
  })

  it('should use custom cursorParam and limitParam names', () => {
    const ctx = createMockRouterContext('http://localhost:8787/api/posts')
    const result: CursorPaginationResult = {
      data: [{ id: '1' }],
      nextCursor: 'abc',
      hasMore: true,
      limit: 10,
    }

    const response = parseResponse(
      ctx.cursorCollection(result, { cursorParam: 'after', limitParam: 'size' }),
    )

    expect(response.body._links).toEqual(
      expect.objectContaining({
        self: { href: '/api/posts?size=10' },
        next: { href: '/api/posts?after=abc&size=10' },
      }),
    )
  })

  it('should preserve existing query params in links', () => {
    const ctx = createMockRouterContext('http://localhost:8787/api/posts?status=active&sort=desc')
    const result: CursorPaginationResult = {
      data: [{ id: '1' }],
      nextCursor: 'abc-123',
      hasMore: true,
      limit: 20,
    }

    const response = parseResponse(ctx.cursorCollection(result))
    const links = response.body._links as Record<string, { href: string }>

    expect(links.self.href).toContain('status=active')
    expect(links.self.href).toContain('sort=desc')
    expect(links.self.href).toContain('limit=20')
    expect(links.next.href).toContain('status=active')
    expect(links.next.href).toContain('sort=desc')
    expect(links.next.href).toContain('cursor=abc-123')
    expect(links.next.href).toContain('limit=20')
  })

  it('should merge additional links from options', () => {
    const ctx = createMockRouterContext('http://localhost:8787/api/posts')
    const result: CursorPaginationResult = {
      data: [],
      nextCursor: null,
      hasMore: false,
      limit: 20,
    }

    const response = parseResponse(
      ctx.cursorCollection(result, {
        links: { create: { href: '/api/posts', method: 'POST' } },
      }),
    )

    expect(response.body._links).toEqual(
      expect.objectContaining({
        self: { href: '/api/posts?limit=20' },
        create: { href: '/api/posts', method: 'POST' },
      }),
    )
  })

  it('should merge additional meta from options', () => {
    const ctx = createMockRouterContext('http://localhost:8787/api/posts')
    const result: CursorPaginationResult = {
      data: [],
      nextCursor: null,
      hasMore: false,
      limit: 20,
    }

    const response = parseResponse(
      ctx.cursorCollection(result, { meta: { filter: 'active' } }),
    )

    expect(response.body._meta).toEqual(
      expect.objectContaining({
        hasMore: false,
        filter: 'active',
      }),
    )
  })

  it('should pass data array as resource data', () => {
    const ctx = createMockRouterContext('http://localhost:8787/api/posts')
    const items = [{ id: '1', title: 'Post 1' }, { id: '2', title: 'Post 2' }]
    const result: CursorPaginationResult = {
      data: items,
      nextCursor: null,
      hasMore: false,
      limit: 20,
    }

    const response = parseResponse(ctx.cursorCollection(result))

    expect(response.body.data).toEqual(items)
  })
})
