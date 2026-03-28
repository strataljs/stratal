/**
 * Path normalization and route ordering utilities.
 *
 * Users always write Hono-style `:param` paths (`:companyId`, `:id`).
 * OpenAPI requires `{param}` style — conversion happens only at registration time.
 */

/**
 * Convert Hono-style `:param` path segments to OpenAPI-style `{param}`.
 *
 * @example
 * toOpenAPIPath('/users/:id')                    // '/users/{id}'
 * toOpenAPIPath('/:companyId/users/:userId')     // '/{companyId}/users/{userId}'
 * toOpenAPIPath('/users/:id/posts')              // '/users/{id}/posts'
 */
export function toOpenAPIPath(path: string): string {
  return path.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{$1}')
}

/**
 * Compute a specificity score for route ordering.
 * Lower score = higher priority (registered first in Hono).
 *
 * Scoring: static segment = 0, `:param` = 10, wildcard `{.+}` / `{.*}` = 100.
 * Locale prefix `/{locale}` adds 1000 so primary paths always come first.
 */
export function getPathSpecificityScore(path: string): number {
  const segments = path.split('/').filter(Boolean)
  let score = 0

  // Locale-prefixed paths always register after their primary counterpart
  if (segments[0] === '{locale}') {
    score += 1000
  }

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    // First-segment {locale} is the locale prefix — already scored above
    if (i === 0 && segment === '{locale}') continue
    if (segment.includes('{.+}') || segment.includes('{.*}')) {
      score += 100
    } else if (segment.startsWith(':') || (segment.startsWith('{') && segment.endsWith('}'))) {
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
