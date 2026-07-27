import { array, boolean, nullable, number, object, optional, record, string, unknown } from 'zod/mini'
import type { RouteConfig } from 'stratal/router'
import { Delete, Get, Patch, Post, Put, Route } from 'stratal/router'

/**
 * Zod schema for the Inertia page JSON response (returned for X-Inertia XHR requests)
 */
export const inertiaPageSchema = object({
  component: string(),
  props: record(string(), unknown()),
  url: string(),
  version: nullable(string()),
  flash: record(string(), unknown()),
  rememberedState: record(string(), unknown()),
  mergeProps: optional(array(string())),
  prependProps: optional(array(string())),
  deepMergeProps: optional(array(string())),
  matchPropsOn: optional(array(string())),
  deferredProps: optional(record(string(), array(string()))),
  initialDeferredProps: optional(record(string(), array(string()))),
  onceProps: optional(record(string(), object({ prop: string(), expiresAt: optional(nullable(number())) }))),
  sharedProps: optional(array(string())),
  encryptHistory: optional(boolean()),
  clearHistory: optional(boolean()),
  preserveFragment: optional(boolean()),
})

export type InertiaRouteConfig = Omit<RouteConfig, 'response' | 'statusCode' | 'hideFromDocs'> & {
  hideFromDocs?: boolean
}

const inertiaResponse = {
  schema: inertiaPageSchema,
  description: 'Inertia page response',
  contentType: 'text/html',
} as const

/**
 * Builds a full RouteConfig from InertiaRouteConfig by applying inertia defaults.
 */
function buildInertiaConfig(config: InertiaRouteConfig): Omit<RouteConfig, 'statusCode'> {
  const { hideFromDocs = true, ...rest } = config
  return { ...rest, response: inertiaResponse, hideFromDocs }
}

/**
 * Decorator for Inertia page routes using convention-based routing.
 *
 * Wraps `@Route()` with:
 * - Auto-applied Inertia page response schema
 * - `hideFromDocs: true` by default (overridable)
 *
 * **Cannot be mixed with HTTP method decorators** (`@Get`, `@Post`, `@InertiaGet`, etc.)
 * in the same controller.
 *
 * @example
 * ```typescript
 * @Controller('/notes')
 * export class NotesController implements IController {
 *   @InertiaRoute({ query: z.object({ page: z.string().optional() }) })
 *   async index(ctx: RouterContext) {
 *     return ctx.inertia('notes/Index', { notes: [] })
 *   }
 * }
 * ```
 */
export function InertiaRoute(config: InertiaRouteConfig = {}) {
  return Route(buildInertiaConfig(config))
}

/**
 * Registers a GET route for an Inertia page.
 *
 * Wraps `@Get()` with auto-applied Inertia page response schema
 * and `hideFromDocs: true` by default.
 *
 * @param path - Route path relative to the controller base path
 * @param config - Optional route configuration (query, params, tags, etc.)
 *
 * @example
 * ```typescript
 * @Controller('/notes')
 * export class NotesController {
 *   @InertiaGet('/')
 *   async index(ctx: RouterContext) {
 *     return ctx.inertia('notes/Index', { notes: [] })
 *   }
 *
 *   @InertiaGet('/:id', { params: z.object({ id: z.string() }) })
 *   async show(ctx: RouterContext) {
 *     return ctx.inertia('notes/Show', { note })
 *   }
 * }
 * ```
 */
export function InertiaGet(path: string, config: InertiaRouteConfig = {}) {
  return Get(path, buildInertiaConfig(config))
}

/**
 * Registers a POST route for an Inertia form submission.
 *
 * Wraps `@Post()` with auto-applied Inertia page response schema
 * and `hideFromDocs: true` by default.
 *
 * @param path - Route path relative to the controller base path
 * @param config - Optional route configuration (body, params, tags, etc.)
 */
export function InertiaPost(path: string, config: InertiaRouteConfig = {}) {
  return Post(path, buildInertiaConfig(config))
}

/**
 * Registers a PUT route for an Inertia form submission.
 *
 * Wraps `@Put()` with auto-applied Inertia page response schema
 * and `hideFromDocs: true` by default.
 *
 * @param path - Route path relative to the controller base path
 * @param config - Optional route configuration (body, params, tags, etc.)
 */
export function InertiaPut(path: string, config: InertiaRouteConfig = {}) {
  return Put(path, buildInertiaConfig(config))
}

/**
 * Registers a PATCH route for an Inertia form submission.
 *
 * Wraps `@Patch()` with auto-applied Inertia page response schema
 * and `hideFromDocs: true` by default.
 *
 * @param path - Route path relative to the controller base path
 * @param config - Optional route configuration (body, params, tags, etc.)
 */
export function InertiaPatch(path: string, config: InertiaRouteConfig = {}) {
  return Patch(path, buildInertiaConfig(config))
}

/**
 * Registers a DELETE route for an Inertia form submission.
 *
 * Wraps `@Delete()` with auto-applied Inertia page response schema
 * and `hideFromDocs: true` by default.
 *
 * @param path - Route path relative to the controller base path
 * @param config - Optional route configuration (params, tags, etc.)
 */
export function InertiaDelete(path: string, config: InertiaRouteConfig = {}) {
  return Delete(path, buildInertiaConfig(config))
}
