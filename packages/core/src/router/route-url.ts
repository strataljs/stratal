import type { RouteName, RouteParams } from './route-map'
import type { RouteRegistry } from './route-registry'

/**
 * Generate a URL from a named route.
 *
 * Keys in `params` matching `:param` placeholders fill the path.
 * Domain params (`{tenant}`) are also consumed from `params`.
 * Extra keys become query string parameters.
 *
 * Use `ctx.route()` in controllers (auto-resolves RouteRegistry from DI).
 * Use this function outside controllers by injecting RouteRegistry via DI.
 *
 * @param registry - RouteRegistry instance (inject via `ROUTER_TOKENS.RouteRegistry`)
 * @param name - Named route identifier
 * @param params - Route params + domain params + extra query params
 * @returns Generated URL string
 *
 * @example
 * ```typescript
 * // In a controller (preferred):
 * ctx.route('users.show', { id: '1' })
 *
 * // Outside controllers (inject registry via DI):
 * import { ROUTER_TOKENS, route } from 'stratal/router'
 *
 * class MyService {
 *   constructor(@inject(ROUTER_TOKENS.RouteRegistry) private registry: RouteRegistry) {}
 *
 *   getUrl() {
 *     return route(this.registry, 'users.show', { id: '1' })
 *   }
 * }
 * ```
 */
export function route<N extends RouteName>(
  registry: RouteRegistry,
  name: N,
  params?: RouteParams<N>,
): string {
  return registry.url(name, params)
}
