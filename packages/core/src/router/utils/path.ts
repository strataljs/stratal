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
 * Compute a specificity score for route ordering.
 * Lower score = higher priority (registered first in Hono).
 *
 * Scoring: static = 0, `:param{constraint}` = 5, `:param` = 10, wildcard `{.+}` / `{.*}` = 100.
 * Constrained params (e.g., `:locale{en|fr}`) are more specific than unconstrained
 * params and register first, ensuring they match before catch-all dynamic segments.
 */
export function getPathSpecificityScore(path: string): number {
  const segments = path.split('/').filter(Boolean)
  let score = 0

  for (const segment of segments) {
    if (segment.includes('{.+}') || segment.includes('{.*}')) {
      score += 100
    } else if (segment.startsWith(':') && segment.includes('{')) {
      // Constrained param (e.g., :locale{en|fr}) — more specific than unconstrained
      score += 5
    } else if (segment.startsWith(':')) {
      score += 10
    }
    // static segments add 0
  }

  return score
}

/**
 * Sort routes by specificity so Hono registers them in the correct order.
 *
 * 1. Static paths before parameterized before wildcards
 * 2. More segments = more specific (tie-breaker)
 * 3. Primary paths before locale-prefixed variants
 */
export function sortRoutesBySpecificity<T extends { path: string }>(routes: T[]): T[] {
  return [...routes].sort((a, b) => {
    const scoreA = getPathSpecificityScore(a.path)
    const scoreB = getPathSpecificityScore(b.path)
    if (scoreA !== scoreB) return scoreA - scoreB

    // Tie-break: more segments = more specific, register first
    const segA = a.path.split('/').filter(Boolean).length
    const segB = b.path.split('/').filter(Boolean).length
    return segB - segA
  })
}
