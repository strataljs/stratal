import { defineMetadata, getMetadata } from '../../di/metadata'
import { ROUTE_METADATA_KEYS } from '../constants'
import type { ConventionRouteMetadata, RouteConfig, RouteMetadata } from '../types'

/**
 * Decorator to add OpenAPI metadata to a controller method using convention-based routing.
 *
 * **Cannot be mixed with HTTP method decorators** (`@Get`, `@Post`, `@Put`, `@Patch`,
 * `@Delete`, `@All`) in the same controller. Use one pattern or the other.
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
export function Route(config: Omit<RouteConfig, 'statusCode'>) {
  return function (
    target: object,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const metadata: ConventionRouteMetadata = {
      type: 'convention',
      config,
    }

    defineMetadata(
      ROUTE_METADATA_KEYS.ROUTE_CONFIG,
      metadata,
      target,
      propertyKey
    )

    // Track this method as decorated on the prototype
    const existing: string[] =
      getMetadata<string[]>(ROUTE_METADATA_KEYS.DECORATED_METHODS, target) ?? []
    existing.push(propertyKey)
    defineMetadata(ROUTE_METADATA_KEYS.DECORATED_METHODS, existing, target)

    return descriptor
  }
}

/**
 * Get the route metadata from a controller method
 *
 * @param target - Controller instance or prototype
 * @param methodName - Name of the method
 * @returns Route metadata or undefined if not decorated
 */
export function getRouteMetadata(target: object, methodName: string): RouteMetadata | undefined {
  return getMetadata<RouteMetadata>(ROUTE_METADATA_KEYS.ROUTE_CONFIG, target, methodName)
}

/**
 * Get all methods with route decorators (@Route, @Get, @Post, etc.) from a controller
 *
 * @param ControllerClass - Controller class
 * @returns Array of method names that have route metadata
 */
export function getRouteDecoratedMethods(ControllerClass: new (...args: unknown[]) => object): string[] {
  const methods = new Set<string>()
  let proto: object | null = ControllerClass.prototype as object

  while (proto && proto !== Object.prototype) {
    const own = getMetadata<string[]>(ROUTE_METADATA_KEYS.DECORATED_METHODS, proto)
    if (own) {
      for (const m of own) methods.add(m)
    }
    proto = Object.getPrototypeOf(proto) as object | null
  }

  return [...methods]
}
