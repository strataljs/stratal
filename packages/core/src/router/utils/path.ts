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
 * Extract the Hono-style `:param` names declared in a route path, in order.
 *
 * Used at registration time to validate `{param.*}` cache tags against the
 * route's own path — see `bindRouteCache`'s `assertParamTagsResolvable`. The
 * route's path is fixed once registered, so which `:param` names it can ever
 * populate is knowable right now, before any request arrives.
 *
 * @example
 * extractPathParams('/users/:id')                // ['id']
 * extractPathParams('/:companyId/users/:userId')  // ['companyId', 'userId']
 * extractPathParams('/:locale{en|fr}/users')      // ['locale']
 * extractPathParams('/health')                    // []
 */
export function extractPathParams(path: string): string[] {
  const params: string[] = []
  for (const match of path.matchAll(/:([a-zA-Z_][a-zA-Z0-9_]*)(?:\{[^}]*\})?/g)) {
    params.push(match[1])
  }
  return params
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
 * Compute a packed specificity key for route ordering.
 * Encodes both score and segment count into a single number to avoid object allocation.
 *
 * Lower score = higher priority (registered first in Hono).
 * Scoring: static = 0, `:param{constraint}` = 5, `:param` = 10, wildcard `{.+}` / `{.*}` = 100.
 *
 * Packed as: score * 10000 - segmentCount (negative segment count so more segments = lower key = higher priority)
 *
 * Locale variants score against the path with the leading `/:locale{…}` segment
 * stripped — the variant's score therefore matches its primary, but its larger
 * segment count makes it sort just before the primary. Without this, a primary
 * catch-all (e.g. `/:slug{.+}`) gobbles locale-prefixed URLs because Hono picks
 * whichever matching route was registered first.
 */
function getPathSpecificityKey(route: { path: string; isLocaleVariant?: boolean }): number {
  const segmentCount = countSegments(route.path)
  const scoringPath = route.isLocaleVariant
    ? (route.path.replace(/^\/:locale\{[^}]*\}/, '') || '/')
    : route.path

  let score = 0
  let i = 0
  while (i < scoringPath.length) {
    if (scoringPath.charCodeAt(i) === 47 /* '/' */) { i++; continue }

    let end = scoringPath.indexOf('/', i)
    if (end === -1) end = scoringPath.length

    const segment = scoringPath.substring(i, end)

    if (segment.includes('{.+}') || segment.includes('{.*}')) {
      score += 100
    } else if (segment.charCodeAt(0) === 58 /* ':' */) {
      score += segment.includes('{') ? 5 : 10
    }

    i = end
  }

  return score * 10000 - segmentCount
}

function countSegments(path: string): number {
  let count = 0
  let i = 0
  while (i < path.length) {
    if (path.charCodeAt(i) === 47 /* '/' */) { i++; continue }
    let end = path.indexOf('/', i)
    if (end === -1) end = path.length
    count++
    i = end
  }
  return count
}

/**
 * Compute a specificity score for route ordering.
 * Lower score = higher priority (registered first in Hono).
 *
 * Scoring: static = 0, `:param{constraint}` = 5, `:param` = 10, wildcard `{.+}` / `{.*}` = 100.
 */
export function getPathSpecificityScore(path: string): number {
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
  return score
}

/**
 * Sort routes by specificity so Hono registers them in the correct order.
 *
 * 1. Static paths before parameterized before wildcards
 * 2. More segments = more specific (tie-breaker)
 * 3. Locale-prefixed variants before their primary (so a locale-prefixed
 *    request matches the variant first; a primary catch-all would otherwise
 *    swallow the locale prefix into its param)
 */
export function sortRoutesBySpecificity<T extends { path: string; isLocaleVariant?: boolean }>(routes: T[]): T[] {
  // Pre-compute packed specificity keys (avoids object allocation per route)
  const keys = new Map<T, number>()
  for (const route of routes) {
    keys.set(route, getPathSpecificityKey(route))
  }

  const copy = routes.slice()
  copy.sort((a, b) => keys.get(a)! - keys.get(b)!)
  return copy
}
