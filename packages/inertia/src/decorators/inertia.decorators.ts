import type { RouteConfig } from 'stratal/router'
import { Delete, Get, Patch, Post, Put, Route } from 'stratal/router'
import { z } from 'stratal/validation'

/**
 * Zod schema for the Inertia page JSON response (returned for X-Inertia XHR requests)
 */
export const inertiaPageSchema = z.object({
  component: z.string(),
  props: z.record(z.string(), z.unknown()),
  url: z.string(),
  version: z.string().nullable(),
  flash: z.record(z.string(), z.unknown()),
  rememberedState: z.record(z.string(), z.unknown()),
  mergeProps: z.array(z.string()).optional(),
  prependProps: z.array(z.string()).optional(),
  deepMergeProps: z.array(z.string()).optional(),
  matchPropsOn: z.array(z.string()).optional(),
  deferredProps: z.record(z.string(), z.array(z.string())).optional(),
  initialDeferredProps: z.record(z.string(), z.array(z.string())).optional(),
  onceProps: z.record(z.string(), z.object({ prop: z.string(), expiresAt: z.number().nullable().optional() })).optional(),
  sharedProps: z.array(z.string()).optional(),
  encryptHistory: z.boolean().optional(),
  clearHistory: z.boolean().optional(),
  preserveFragment: z.boolean().optional(),
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
