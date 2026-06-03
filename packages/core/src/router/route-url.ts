import { getContainer } from '../di/container-storage';
import type { RouteName, RouteParams } from './route-map';
import { ROUTER_TOKENS } from './router.tokens';
import { type Uri, type UriOptions } from './uri';

/**
 * Generate a URL from a named route.
 *
 * Keys in `params` matching `:param` placeholders fill the path.
 * Domain params (`{tenant}`) are also consumed from `params`.
 * Extra keys become query string parameters.
 *
 * Resolves RouteRegistry from the application container via AsyncLocalStorage.
 * Available after `Application.initialize()` has been called.
 *
 * @param name - Named route identifier
 * @param params - Route params + domain params + extra query params
 * @returns Generated URL string
 *
 * @example
 * ```typescript
 * // In a controller (preferred):
 * ctx.route('users.show', { id: '1' })
 *
 * // Outside controllers (standalone function):
 * import { route } from 'stratal/router'
 *
 * route('users.show', { id: '1' })
 * ```
 */
export function route<N extends RouteName>(
  name: N,
  params?: RouteParams<N>,
  options?: UriOptions
): string {
  const container = getContainer()
  const uri = container.resolve<Uri>(ROUTER_TOKENS.Uri)

  return uri.route(name, params, options)
}
