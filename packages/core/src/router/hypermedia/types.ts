import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { Constructor } from '../../types'

/**
 * Standard IANA link relations
 * @see https://www.iana.org/assignments/link-relations/link-relations.xhtml
 */
export type StandardLinkRelation =
  | 'self'
  | 'next'
  | 'prev'
  | 'first'
  | 'last'
  | 'collection'
  | 'item'
  | 'edit'
  | 'delete'
  | 'create'
  | 'up'
  | 'related'

/**
 * A single hypermedia link
 */
export interface HypermediaLink {
  href: string
  method?: string
  title?: string
  templated?: boolean
}

/**
 * Map of link relations to links
 * Supports standard IANA relations plus custom string keys
 */
export type LinkMap = Partial<Record<StandardLinkRelation, HypermediaLink>> &
  Record<string, HypermediaLink>

/**
 * Pagination context for generating collection links
 */
export interface PaginationLinkContext {
  page: number
  limit: number
  total: number
  totalPages: number
}

/**
 * Options for `ctx.resource()` — single resource envelope response
 */
export interface ResourceResponseOptions {
  links?: LinkMap
  meta?: Record<string, unknown>
  status?: ContentfulStatusCode
}

/**
 * Options for `ctx.collection()` — paginated collection envelope response
 * Links and meta are merged with auto-generated pagination values
 */
export interface CollectionResponseOptions {
  links?: LinkMap
  meta?: Record<string, unknown>
  status?: ContentfulStatusCode
}

/**
 * Cursor pagination result — matches the shape returned by db.$resource.cursorPaginate()
 */
export interface CursorPaginationResult<T = unknown> {
  data: T[]
  nextCursor: string | number | null
  hasMore: boolean
  limit: number
}

/**
 * Options for cursor collection response
 */
export interface CursorCollectionOptions extends CollectionResponseOptions {
  /** Query param name for cursor, defaults to 'cursor' */
  cursorParam?: string
  /** Query param name for limit, defaults to 'limit' */
  limitParam?: string
}

/**
 * Helper type that extracts method names from a class type
 */
export type MethodNames<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => unknown ? K : never
}[keyof T] & string

/**
 * Convention mapping from controller method names to link relations
 */
export const RESOURCE_LINK_MAPPING = {
  index: { relation: 'collection', method: 'GET' },
  show: { relation: 'self', method: 'GET' },
  create: { relation: 'create', method: 'POST' },
  update: { relation: 'update', method: 'PUT' },
  patch: { relation: 'edit', method: 'PATCH' },
  destroy: { relation: 'delete', method: 'DELETE' },
} as const satisfies Record<string, { relation: string; method: string }>

/**
 * Type guard to check if a value is a class constructor
 */
export function isConstructor(value: unknown): value is Constructor {
  return typeof value === 'function' && value.prototype !== undefined
}
