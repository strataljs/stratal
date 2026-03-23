import type { RouteConfig } from 'stratal/router'
import { Route } from 'stratal/router'
import { z } from 'stratal/validation'

/**
 * Zod schema for the Inertia page JSON response (returned for X-Inertia XHR requests)
 */
export const inertiaPageSchema = z.object({
  component: z.string(),
  props: z.record(z.string(), z.unknown()),
  url: z.string(),
  version: z.string(),
  mergeProps: z.array(z.string()),
  deferredProps: z.record(z.string(), z.array(z.string())),
  encryptHistory: z.boolean(),
  clearHistory: z.boolean(),
})

export type InertiaRouteConfig = Omit<RouteConfig, 'response' | 'statusCode' | 'hideFromDocs'> & {
  hideFromDocs?: boolean
}

/**
 * Decorator for Inertia page routes.
 *
 * Wraps `@Route()` with:
 * - Auto-applied Inertia page response schema
 * - `hideFromDocs: true` by default (overridable)
 *
 * Accepts `query`, `params`, `body`, `tags`, `summary`, `description`, `security`.
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
  const { hideFromDocs = true, ...rest } = config

  return Route({
    ...rest,
    response: {
      schema: inertiaPageSchema,
      description: 'Inertia page response',
      contentType: 'text/html',
    },
    hideFromDocs,
  })
}
