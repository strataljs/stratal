/**
 * Dependency injection tokens for the router system
 *
 * Controllers and middlewares are exposed via module methods (getControllers() and getMiddlewares())
 * rather than DI tokens. The Application collects them by iterating through modules.
 *
 * ## Service Instantiation Pattern
 *
 * Router services (RouteRegistrationService, OpenAPIService) are manually instantiated in RouterService
 * rather than resolved from the DI container. This is intentional and provides several benefits:
 *
 * 1. **Lifecycle Control**: Services are created once during router initialization and reused across
 *    all requests, ensuring singleton behavior without relying on DI container scope management.
 *
 * 2. **Performance**: Avoiding container resolution on each request reduces overhead. These services
 *    don't need request-scoped data and can safely be singletons.
 *
 * 3. **Dependency Injection Still Works**: Constructor injection still works perfectly - the container
 *    resolves dependencies (like Logger) when we call `new RouteRegistrationService()`. We're only
 *    bypassing the container for the top-level service itself.
 *
 * 4. **Clarity**: Makes it explicit that these are singleton services that manage router configuration,
 *    not request-scoped services that handle individual requests.
 *
 * This pattern is safe and recommended for stateless utility services that don't need request context.
 * Request-scoped services (like controllers) are still resolved from the container on each request.
 */
export const ROUTER_TOKENS = {
  /**
   * Token for RouterService singleton
   */
  RouterService: Symbol.for('RouterService'),

  /**
   * Token for RouterContext (request-scoped)
   * Contains Hono context wrapper with helper methods
   */
  RouterContext: Symbol.for('RouterContext'),
} as const
