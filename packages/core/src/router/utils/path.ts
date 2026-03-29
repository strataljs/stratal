/**
 * Path normalization and route ordering utilities.
 *
 * Users always write Hono-style `:param` paths (`:companyId`, `:id`).
 * OpenAPI requires `{param}` style — conversion happens only at registration time.
 */

/**
 * Convert Hono-style `:param` path segments to OpenAPI-style `{param}`.
 * Strips regex constraints (e.g., `:locale{sw}` → `{locale}`).
 *
 * @example
 * toOpenAPIPath('/users/:id')                    // '/users/{id}'
 * toOpenAPIPath('/:companyId/users/:userId')     // '/{companyId}/users/{userId}'
 * toOpenAPIPath('/users/:id/posts')              // '/users/{id}/posts'
 * toOpenAPIPath('/:locale{en|fr}/users')         // '/{locale}/users'
 */
export function toOpenAPIPath(path: string): string {
  return path.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)(\{[^}]*\})?/g, '{$1}')
}

/**
 * Convert Hono-style `:param` path segments to OpenAPI-style `{param}`,
 * preserving regex constraints.
 *
 * Used for Hono route registration via `app.openapi()`. The non-greedy
 * regex in `@hono/zod-openapi` (`\/{(.+?)}/g`) converts `{param}` back
 * to `:param` while leaving the constraint suffix intact.
 *
 * @example
 * toRoutingOpenAPIPath('/:locale{sw}/users/:id')  // '/{locale}{sw}/users/{id}'
 * toRoutingOpenAPIPath('/users/:id')               // '/users/{id}'
 */
export function toRoutingOpenAPIPath(path: string): string {
  return path.replace(
    /:([a-zA-Z_][a-zA-Z0-9_]*)(\{[^}]*\})?/g,
    (_, name: string, constraint?: string) => constraint ? `{${name}}${constraint}` : `{${name}}`,
  )
}

/**
 * Compute specificity score and segment count in a single pass.
 * Lower score = higher priority (registered first in Hono).
 *
 * Scoring: static = 0, `:param{constraint}` = 5, `:param` = 10, wildcard `{.+}` / `{.*}` = 100.
 * Constrained params (e.g., `:locale{en|fr}`) are more specific than unconstrained
 * params and register first, ensuring they match before catch-all dynamic segments.
 */
export function getPathSpecificity(path: string): { score: number; segmentCount: number } {
  const segments = path.split('/').filter(Boolean)
  let score = 0

  for (const segment of segments) {
    if (segment.includes('{.+}') || segment.includes('{.*}')) {
      score += 100
    } else if (segment.startsWith(':') && segment.includes('{')) {
      score += 5
    } else if (segment.startsWith(':')) {
      score += 10
    }
  }

  return { score, segmentCount: segments.length }
}

/**
 * Compute a specificity score for route ordering (score only, no segment count).
 * @see getPathSpecificity for combined score + segment count.
 */
export function getPathSpecificityScore(path: string): number {
  return getPathSpecificity(path).score
}

/**
 * Sort routes by specificity so Hono registers them in the correct order.
 *
 * 1. Static paths before parameterized before wildcards
 * 2. More segments = more specific (tie-breaker)
 * 3. Primary paths before locale-prefixed variants
 */
export function sortRoutesBySpecificity<T extends { path: string }>(routes: T[]): T[] {
  // Pre-compute specificity for each route in a single pass (avoids re-splitting in comparator)
  const scored = routes.map(route => {
    const { score, segmentCount } = getPathSpecificity(route.path)
    return { route, score, segmentCount }
  })

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    return b.segmentCount - a.segmentCount
  })

  return scored.map(s => s.route)
}
