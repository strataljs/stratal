import type { TrailingSlashMode } from './types'

/**
 * Apply a trailing-slash mode to a URL or path.
 *
 * - `'ignore'` — return as-is.
 * - `'always'` — append `/` to the pathname unless it already has one.
 *   Skipped when the last segment contains `.` (file-like paths) and for the
 *   root `/` path.
 * - `'never'`  — strip a trailing `/` from the pathname. Skipped for root.
 *
 * Preserves query string and hash. Handles both relative paths
 * (`/foo?x=1`) and absolute URLs (`https://host/foo?x=1`).
 *
 * Used by URL-generation helpers and the redirect middleware so canonical
 * form is computed in one place.
 */
export function applyTrailingSlash(url: string, mode: TrailingSlashMode): string {
  if (mode === 'ignore') return url

  const isAbsolute = /^https?:\/\//i.test(url)
  const parsed = isAbsolute
    ? new URL(url)
    : new URL(url, 'http://placeholder.local')

  const path = parsed.pathname
  if (path === '/') return url

  const hasTrailing = path.endsWith('/')

  if (mode === 'always' && !hasTrailing) {
    const lastSegment = path.slice(path.lastIndexOf('/') + 1)
    if (lastSegment.includes('.')) return url
    parsed.pathname = `${path}/`
  } else if (mode === 'never' && hasTrailing) {
    parsed.pathname = path.slice(0, -1)
  } else {
    return url
  }

  return isAbsolute
    ? parsed.toString()
    : `${parsed.pathname}${parsed.search}${parsed.hash}`
}
