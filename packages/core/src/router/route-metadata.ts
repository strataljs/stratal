import type { ZodType } from '../i18n/validation/zod'
import { Singleton } from '../di/decorators'
import { ROUTER_TOKENS } from './router.tokens'
import type { HttpMethod, SecuritySchemeRecord } from './types'

/** A single response declaration for a route, keyed by status code. */
export interface RouteResponseMeta {
  status: number
  /** Absent for empty responses (e.g. 204); present for typed JSON responses. */
  schema?: ZodType
  contentType: string
  description: string
}

/**
 * Schema + documentation metadata for one registered route. Collected at
 * registration time and consumed lazily by the OpenAPI generator. Holds Zod
 * schema *instances* (never imports `zod` itself) so a route with no schemas
 * contributes none and pulls in no validation code.
 */
export interface RouteSchemaMeta {
  method: Exclude<HttpMethod, 'all'>
  /** Clean OpenAPI path with `{param}` placeholders and regex constraints stripped. */
  path: string
  /** Hidden routes are still registered (for access control) but excluded from the doc. */
  hidden: boolean
  tags: string[]
  security: SecuritySchemeRecord[]
  summary?: string
  description?: string
  request: {
    params?: ZodType
    query?: ZodType
    body?: { schema: ZodType; contentType: string }
  }
  responses: RouteResponseMeta[]
  /**
   * Localized variant: the `locale` path segment to document as an enum. The
   * value set is carried as plain strings so the generator emits the enum
   * without constructing a Zod schema on the hot path.
   */
  localeParam?: { name: string; values: string[] }
  /**
   * Visibility group labels for this route, resolved from the controller's and
   * route's `groups` options. Absent when none are declared.
   */
  groups?: string[]
  /** Extensible metadata bag for downstream packages. */
  meta?: Record<string, unknown>
}

/**
 * Stratal-owned registry of route schema metadata. Replaces writes to
 * `@hono/zod-openapi`'s internal `openAPIRegistry`: route registration pushes
 * entries here, and the OpenAPI generator reads them on demand.
 */
@Singleton(ROUTER_TOKENS.RouteMetadataRegistry)
export class RouteMetadataRegistry {
  private readonly entries: RouteSchemaMeta[] = []

  add(entry: RouteSchemaMeta): void {
    this.entries.push(entry)
  }

  all(): readonly RouteSchemaMeta[] {
    return this.entries
  }
}
