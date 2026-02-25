import { ROUTE_METADATA_KEYS } from '../constants'
import type { RouteConfig } from '../types'

/**
 * Decorator to add OpenAPI metadata to a controller method
 *
 * Stores route configuration (schemas, response, tags, security) in metadata.
 * HTTP method, path, and success status code are auto-derived from the method name:
 * - index() → GET /base-path → 200
 * - show() → GET /base-path/:id → 200
 * - create() → POST /base-path → 201
 * - update() → PUT /base-path/:id → 200
 * - patch() → PATCH /base-path/:id → 200
 * - destroy() → DELETE /base-path/:id → 200
 *
 * @param config - Route configuration (schemas, response, tags, security)
 *
 * @example
 * ```typescript
 * @Controller('/api/v1/notes', {
 *   tags: ['Notes'],
 *   security: ['bearerAuth']
 * })
 * export class NotesController implements Controller {
 *   @Route({
 *     body: createNoteSchema,
 *     response: noteSchema, // 201 auto-derived from 'create' method
 *     tags: ['Mutations'],
 *     description: 'Create a new note'
 *   })
 *   async create(ctx: RouterContext): Promise<Response> {
 *     // POST /api/v1/notes (auto-derived from method name)
 *     // Body schema: createNoteSchema (auto-validated)
 *     // Response: 201 → noteSchema (status auto-derived)
 *     // Tags: ['Notes', 'Mutations'] (merged with controller)
 *     // Security: ['bearerAuth'] (inherited from controller)
 *     const body = ctx.body()
 *     const note = await this.notesService.create(body)
 *     return ctx.json(note, 201)
 *   }
 *
 *   @Route({
 *     query: paginationSchema,
 *     response: z.array(noteSchema) // 200 auto-derived from 'index' method
 *   })
 *   async index(ctx: RouterContext): Promise<Response> {
 *     // GET /api/v1/notes (auto-derived)
 *     // Query params auto-validated
 *     const notes = await this.notesService.list()
 *     return ctx.json(notes)
 *   }
 *
 *   @Route({
 *     params: z.object({ id: z.string().uuid() }),
 *     response: {
 *       schema: noteSchema,
 *       description: 'Note details'
 *     },
 *     security: [] // Override to make public
 *   })
 *   async show(ctx: RouterContext): Promise<Response> {
 *     // GET /api/v1/notes/:id (auto-derived)
 *     // URL params auto-validated
 *     // Response: 200 → noteSchema (status auto-derived)
 *     // Security: [] (public route, override controller security)
 *     const id = ctx.param('id')
 *     const note = await this.notesService.findById(id)
 *     return ctx.json(note)
 *   }
 * }
 * ```
 */
export function Route(config: RouteConfig) {
  return function (
    target: object,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    // Store route config metadata on the method
    Reflect.defineMetadata(
      ROUTE_METADATA_KEYS.ROUTE_CONFIG,
      config,
      target,
      propertyKey
    )

    return descriptor
  }
}

/**
 * Get the route configuration from a controller method
 *
 * @param target - Controller instance or prototype
 * @param methodName - Name of the method
 * @returns Route configuration or undefined if not decorated
 */
export function getRouteConfig(target: object, methodName: string): RouteConfig | undefined {
  return Reflect.getMetadata(ROUTE_METADATA_KEYS.ROUTE_CONFIG, target, methodName) as RouteConfig | undefined
}

/**
 * Get all methods with @Route() decorator from a controller
 *
 * @param ControllerClass - Controller class
 * @returns Array of method names that have route config
 */
export function getDecoratedMethods(ControllerClass: new (...args: unknown[]) => object): string[] {
  const prototype = ControllerClass.prototype as Record<string, unknown>
  const methodNames = Object.getOwnPropertyNames(prototype).filter(
    name => name !== 'constructor' && typeof prototype[name] === 'function'
  )

  return methodNames.filter(methodName =>
    Reflect.hasMetadata(ROUTE_METADATA_KEYS.ROUTE_CONFIG, prototype, methodName)
  )
}
