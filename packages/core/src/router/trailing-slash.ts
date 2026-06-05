import { stripLocalePrefix } from './locale-url'
import type { TrailingSlashConfig, TrailingSlashExclude, TrailingSlashOptions } from './types'

/** Normalise the `trailingSlash` config (bare mode or `{ mode, exclude }`). */
export function resolveTrailingSlash(config: TrailingSlashConfig | undefined): TrailingSlashOptions {
  if (!config) return { mode: 'ignore' }
  if (typeof config === 'string') return { mode: config }
  return config
}

/** Strip a single trailing `/` from a path. Root (`/`) is left untouched. */
const stripTrailingSlash = (path: string): string =>
  path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path

/**
 * Whether a pathname is exempt from trailing-slash canonicalisation.
 *
 * String patterns are segment-aware prefixes. RegExps are tested against
 * both forms of the pathname (with and without the trailing slash), so a
 * pattern anchored to either form exempts both — same guarantee as strings.
 *
 * When `locales` is given (path-based locale detection), a leading locale
 * segment is stripped and the bare path matched too, so `'/callback'` also
 * exempts `/fr/callback` — exclusions are written in route space, like the
 * routes themselves.
 */
export function isTrailingSlashExcluded(
  pathname: string,
  exclude: readonly TrailingSlashExclude[] | undefined,
  locales?: readonly string[],
): boolean {
  if (!exclude?.length) return false

  const candidates = [pathname]
  if (locales?.length) {
    const stripped = stripLocalePrefix(pathname, locales)
    if (stripped !== pathname) candidates.push(stripped)
  }

  return candidates.some((candidate) => {
    const bare = stripTrailingSlash(candidate)
    const slashed = bare === '/' ? bare : `${bare}/`
    return exclude.some((pattern) => {
      if (typeof pattern !== 'string') return pattern.test(bare) || pattern.test(slashed)
      const prefix = stripTrailingSlash(pattern)
      return bare === prefix || bare.startsWith(`${prefix}/`)
    })
  })
}

/**
 * Apply a trailing-slash config to a URL or path.
 *
 * - `'ignore'` — return as-is.
 * - `'always'` — append `/` to the pathname unless it already has one.
 *   Skipped when the last segment contains `.` (file-like paths) and for the
 *   root `/` path.
 * - `'never'`  — strip a trailing `/` from the pathname. Skipped for root.
 *
 * Paths matching the config's `exclude` list are returned as-is — their
 * canonical form is owned elsewhere (e.g. an OAuth redirect URI registered
 * with an IdP and matched byte-for-byte). Pass `locales` when path-based
 * locale detection is active so locale-prefixed forms of excluded paths are
 * exempt too (see {@link isTrailingSlashExcluded}).
 *
 * Preserves query string and hash. Handles both relative paths
 * (`/foo?x=1`) and absolute URLs (`https://host/foo?x=1`).
 *
 * Used by URL-generation helpers and the redirect middleware so canonical
 * form is computed in one place.
 */
export function applyTrailingSlash(url: string, config: TrailingSlashConfig, locales?: readonly string[]): string {
  const { mode, exclude } = resolveTrailingSlash(config)
  if (mode === 'ignore') return url

  const isAbsolute = /^https?:\/\//i.test(url)
  const parsed = isAbsolute
    ? new URL(url)
    : new URL(url, 'http://placeholder.local')

  const path = parsed.pathname
  if (path === '/') return url
  if (isTrailingSlashExcluded(path, exclude, locales)) return url

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
