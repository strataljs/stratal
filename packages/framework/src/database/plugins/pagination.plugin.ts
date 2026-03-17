import { definePlugin } from '@zenstackhq/orm'

/**
 * Options for offset-based pagination (skip/take)
 */
export interface PaginateOptions {
  /** Page number (1-indexed), defaults to 1 */
  page?: number
  /** Items per page, defaults to 20 */
  limit?: number
  /** Filter conditions shared between findMany and count */
  where?: unknown
  /** Select specific fields (findMany only) */
  select?: unknown
  /** Include relations (findMany only) */
  include?: unknown
  /** Omit specific fields (findMany only) */
  omit?: unknown
  /** Ordering (findMany only) */
  orderBy?: unknown
}

/**
 * Result of offset-based pagination
 * `pagination` matches PaginationLinkContext for use with ctx.collection()
 */
export interface PaginateResult<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

/**
 * Options for cursor-based pagination
 */
export interface CursorPaginateOptions {
  /** Items per page, defaults to 20 */
  limit?: number
  /** Start after this cursor value (null/undefined = first page) */
  cursor?: string | number
  /** Field to use as cursor, defaults to 'id' */
  cursorField?: string
  /** Filter conditions */
  where?: unknown
  /** Select specific fields */
  select?: unknown
  /** Include relations */
  include?: unknown
  /** Omit specific fields */
  omit?: unknown
  /** Ordering */
  orderBy?: unknown
}

/**
 * Result of cursor-based pagination
 * Includes `limit` so ctx.cursorCollection() has everything it needs
 */
export interface CursorPaginateResult<T> {
  data: T[]
  nextCursor: string | number | null
  hasMore: boolean
  limit: number
}

/**
 * Pagination plugin for ZenStack
 *
 * Adds `$resource.paginate()` and `$resource.cursorPaginate()` methods
 * to the database client for offset-based and cursor-based pagination.
 *
 * @example
 * ```typescript
 * // Offset-based pagination
 * const result = await this.db.$resource.paginate('user', {
 *   page: 2, limit: 20,
 *   where: { active: true },
 * })
 * return ctx.collection(result.data, result.pagination)
 *
 * // Cursor-based pagination
 * const result = await this.db.$resource.cursorPaginate('post', {
 *   cursor: 'abc-123', limit: 20,
 *   where: { published: true },
 *   orderBy: { createdAt: 'desc' },
 * })
 * return ctx.cursorCollection(result)
 * ```
 */
export const paginationPlugin = definePlugin({
  id: 'pagination',
  client: {
    $resource: {
      async paginate(model: string, options: PaginateOptions = {}): Promise<PaginateResult<unknown>> {
        const delegate = (this as unknown as Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>)[model]
        const page = options.page ?? 1
        const limit = options.limit ?? 20
        const skip = (page - 1) * limit

        const [data, total] = await Promise.all([
          delegate.findMany({
            where: options.where,
            select: options.select,
            include: options.include,
            omit: options.omit,
            orderBy: options.orderBy,
            skip,
            take: limit,
          }),
          delegate.count({ where: options.where }),
        ]) as [unknown[], number]

        return {
          data,
          pagination: {
            page,
            limit,
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / limit),
          },
        }
      },

      async cursorPaginate(model: string, options: CursorPaginateOptions = {}): Promise<CursorPaginateResult<unknown>> {
        const delegate = (this as unknown as Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>)[model]
        const limit = options.limit ?? 20
        const cursorField = options.cursorField ?? 'id'

        const findArgs: Record<string, unknown> = {
          where: options.where,
          select: options.select,
          include: options.include,
          omit: options.omit,
          orderBy: options.orderBy,
          take: limit + 1,
        }

        if (options.cursor != null) {
          findArgs.cursor = { [cursorField]: options.cursor }
          findArgs.skip = 1 // skip the cursor record itself
        }

        const results = await delegate.findMany(findArgs) as Record<string, unknown>[]
        const hasMore = results.length > limit
        const data = hasMore ? results.slice(0, limit) : results
        const nextCursor = hasMore && data.length > 0
          ? data[data.length - 1][cursorField] as string | number
          : null

        return { data, nextCursor, hasMore, limit }
      },
    },
  },
})
