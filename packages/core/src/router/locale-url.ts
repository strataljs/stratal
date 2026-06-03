import type { LocaleUrlConfig } from './types'

/**
 * Pure helpers for locale-aware URL path manipulation.
 *
 * Each function takes config explicitly so it can run anywhere (no DI, no request
 * context). For ergonomic DI-driven access, see {@link LocaleUrlService} which
 * binds these to the resolved {@link LocalePathService} config.
 */

/**
 * Whether a locale should be URL-prefixed under the given config.
 *
 * - No config → always prefix (caller didn't opt into locale-aware URLs).
 * - `prefixDefaultLocale: true` → every locale, including the default, is prefixed.
 * - Otherwise → only non-default locales are prefixed.
 */
export function shouldPrefixLocale(locale: string, config: LocaleUrlConfig | undefined): boolean {
  if (!config) return true
  if (config.prefixDefaultLocale === true) return true
  return locale !== config.defaultLocale
}

/**
 * Prepend `/{locale}` to a pathname, respecting `prefixDefaultLocale`.
 * Returns the pathname unchanged when the locale shouldn't be prefixed.
 */
export function applyLocalePrefix(pathname: string, locale: string, config: LocaleUrlConfig | undefined): string {
  if (!shouldPrefixLocale(locale, config)) return pathname
  return pathname === '/' ? `/${locale}` : `/${locale}${pathname}`
}

/**
 * Strip a known-locale prefix from the start of a pathname.
 * Returns the pathname unchanged if the first segment isn't in `knownLocales`.
 */
export function stripLocalePrefix(pathname: string, knownLocales: readonly string[]): string {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length > 0 && knownLocales.includes(segments[0])) {
    const rest = segments.slice(1).join('/')
    return rest ? `/${rest}` : '/'
  }
  return pathname
}
