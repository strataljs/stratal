import type { MiddlewareHandler } from 'hono'
import type { RouterEnv, TrailingSlashMode } from '../types'

const REDIRECT_STATUS = 308

/**
 * Create a Hono middleware that canonicalises trailing slashes via 308 redirects.
 *
 * - `'ignore'` — returns `null`; routes match both `/foo` and `/foo/` natively
 *   (Hono handles this when constructed with `strict: false`).
 * - `'always'` — non-trailing requests redirect to the trailing-slash form.
 *   Paths whose last segment contains `.` (e.g. `/api/openapi.json`) are skipped.
 * - `'never'`  — trailing requests redirect to the non-trailing form.
 *
 * Root (`/`) is always passed through unchanged.
 *
 * 308 is used so that POST/PUT/PATCH bodies survive the redirect.
 */
export function createTrailingSlashRedirect(
  mode: TrailingSlashMode,
): MiddlewareHandler<RouterEnv> | null {
  if (mode === 'ignore') return null

  return async (c, next) => {
    const url = new URL(c.req.url)
    const path = url.pathname
    if (path === '/') return next()

    const hasTrailing = path.endsWith('/')

    if (mode === 'always' && !hasTrailing) {
      const lastSegment = path.slice(path.lastIndexOf('/') + 1)
      if (lastSegment.includes('.')) return next()
      url.pathname = `${path}/`
      return c.redirect(url.toString(), REDIRECT_STATUS)
    }

    if (mode === 'never' && hasTrailing) {
      url.pathname = path.slice(0, -1)
      return c.redirect(url.toString(), REDIRECT_STATUS)
    }

    return next()
  }
}
