import type { MiddlewareHandler } from 'hono'
import { applyTrailingSlash } from '../trailing-slash'
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
 *
 * Location headers are emitted as path-relative URIs so the user agent
 * resolves them against the effective request URI — sidestepping scheme
 * mismatches behind HTTPS-terminating proxies that proxy HTTPS pages to an
 * HTTP-speaking backend (which would otherwise produce a mixed-content block).
 */
export function createTrailingSlashRedirect(
  mode: TrailingSlashMode,
): MiddlewareHandler<RouterEnv> | null {
  if (mode === 'ignore') return null

  return async (c, next) => {
    const url = new URL(c.req.url)
    const canonicalPath = applyTrailingSlash(url.pathname, mode)
    if (canonicalPath === url.pathname) return next()
    return c.redirect(`${canonicalPath}${url.search}`, REDIRECT_STATUS)
  }
}
