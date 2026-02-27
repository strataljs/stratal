import type { RouterContext } from './router-context'

/**
 * Controller interface for handling HTTP requests
 *
 * Controllers can implement RESTful methods or a custom handle() method.
 * The route for the controller is set via the `@Controller` decorator.
 *
 * RESTful methods auto-map to HTTP verbs:
 * - index() → GET /route
 * - show() → GET /route/:id
 * - create() → POST /route
 * - update() → PUT /route/:id
 * - patch() → PATCH /route/:id
 * - destroy() → DELETE /route/:id
 *
 * For non-RESTful routes (wildcards, custom patterns), implement handle()
 */
export interface IController {
  /**
   * GET /route
   * List all resources
   */
  index?(ctx: RouterContext): Promise<Response> | Response

  /**
   * GET /route/:id
   * Show a specific resource
   */
  show?(ctx: RouterContext): Promise<Response> | Response

  /**
   * POST /route
   * Create a new resource
   */
  create?(ctx: RouterContext): Promise<Response> | Response

  /**
   * PUT /route/:id
   * Update a resource (full replacement)
   */
  update?(ctx: RouterContext): Promise<Response> | Response

  /**
   * PATCH /route/:id
   * Patch a resource (partial update)
   */
  patch?(ctx: RouterContext): Promise<Response> | Response

  /**
   * DELETE /route/:id
   * Delete a resource
   */
  destroy?(ctx: RouterContext): Promise<Response> | Response

  /**
   * Custom handler for non-RESTful routes
   * Use this for wildcards (e.g., /api/v1/auth/*) or custom patterns
   * Takes precedence over RESTful methods if defined
   */
  handle?(ctx: RouterContext): Promise<Response> | Response
}
