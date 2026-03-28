import type { HttpMethod } from '../router/types'

/**
 * Route information for versioning and path resolution
 */
export interface RouteInfo {
  /** Route path pattern (e.g., '/api/v1/users', '/health') */
  path: string
  /** HTTP method(s) to match. If omitted, matches all methods */
  method?: HttpMethod | HttpMethod[]
  /** API version(s) to target. When versioning is enabled, resolves to versioned path. */
  version?: string | string[]
}
