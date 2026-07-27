/**
 * I18n Module Options
 *
 * Configuration options for the I18n dynamic module.
 * Use with I18nModule.forRoot() / forRootAsync() to configure locale settings.
 * Use I18nModule.registerMessages() to add translations.
 */

import type { DetectorOptions } from 'hono/language';

/**
 * Detection strategy for locale resolution
 *
 * - `'cookie'` — reads from the `locale` cookie (default)
 * - `'header'` — reads from the `Accept-Language` header
 * - `'querystring'` — reads from the `?locale=` query parameter
 * - `'path'` — reads from the first URL path segment (e.g., `/en/api/users`)
 */
export type DetectionStrategy = 'cookie' | 'header' | 'querystring' | 'path'

/** The cookie (and query-string key) the `locale` is read from / written to. */
export const LOCALE_COOKIE = 'locale'

interface BaseDetection {
  /** Set to false to disable language detection entirely. @default true */
  enabled?: boolean
}

/**
 * Language detection options (discriminated by strategy)
 *
 * @example Cookie detection (default)
 * ```typescript
 * { strategy: 'cookie' }
 * ```
 *
 * @example Header detection
 * ```typescript
 * { strategy: 'header' }
 * ```
 *
 * @example Path detection
 * ```typescript
 * { strategy: 'path' }
 * ```
 *
 * @example Disable detection
 * ```typescript
 * { enabled: false }
 * ```
 */
export type LanguageDetectionOptions =
  | (BaseDetection & { strategy?: 'cookie'; cookieOptions?: DetectorOptions['cookieOptions'] })
  | (BaseDetection & { strategy: 'header' })
  | (BaseDetection & { strategy: 'querystring' })
  | (BaseDetection & {
    strategy: 'path'
    /**
     * Controls whether the default locale gets a URL path prefix.
     *
     * - `false` (default) — The default locale has no prefix (`/users`), other locales
     *   are prefixed (`/fr/users`). Requests to the prefixed default locale (`/en/users`) return 404.
     * - `'redirect'` — Same as `false`, but requests to the prefixed default locale
     *   (`/en/users`) are 301-redirected to the unprefixed path (`/users`).
     * - `true` — All locales are prefixed (`/en/users`, `/fr/users`).
     *
     * @default false
     */
    prefixDefaultLocale?: false | true | 'redirect'
  })
  | { enabled: false }

/**
 * A per-path detection resolver.
 *
 * Returns the detection options for a given request path. It **must be a pure
 * function of the path**: route `/:locale` variant expansion runs it at boot,
 * once per registered route pattern, where no request exists — so the decision
 * (e.g. "`/admin` is cookie-localized, everything else is path-localized") has
 * to be derivable from the path alone, and must agree at boot and per request.
 *
 * @example
 * ```typescript
 * detection: (path) =>
 *   path.startsWith('/admin')
 *     ? { strategy: 'cookie', cookieOptions: { path: '/admin' } }
 *     : { strategy: 'path' }
 * ```
 */
export type DetectionResolver = (path: string) => LanguageDetectionOptions

/** Detection config: a single static option set, or a per-path resolver. */
export type DetectionConfig = LanguageDetectionOptions | DetectionResolver

/**
 * Options for configuring the I18n module
 *
 * @example
 * ```typescript
 * I18nModule.forRoot({
 *   defaultLocale: 'en',
 *   fallbackLocale: 'en',
 *   locales: ['en', 'fr'],
 *   detection: { strategy: 'header' },
 * })
 * ```
 */
export interface I18nModuleOptions {
  /**
   * Default locale for the application
   * @default 'en'
   */
  defaultLocale?: string

  /**
   * Fallback locale when translation is missing
   * @default 'en'
   */
  fallbackLocale?: string

  /**
   * List of supported locales
   * Request locales not in this list will fall back to defaultLocale
   */
  locales?: string[]

  /**
   * Language detection configuration. Either a single option set applied to
   * every request, or a {@link DetectionResolver} — a pure function of the
   * request path — so different areas can use different strategies (e.g. a
   * path-localized public site with a cookie-localized `/admin` panel).
   */
  detection?: DetectionConfig
}

/**
 * Detection options resolved for a single path (all defaults applied).
 */
export interface ResolvedDetection {
  enabled: boolean
  strategy: DetectionStrategy
  /** Only meaningful when `strategy` is `'path'`. */
  prefixDefaultLocale: false | true | 'redirect'
  /**
   * Cookie attributes for the persisted `locale` cookie under cookie strategy
   * (e.g. `{ path: '/admin' }` to scope a panel's locale so it isn't written at
   * the default `Path=/`).
   */
  cookieOptions?: DetectorOptions['cookieOptions']
}

/**
 * Resolved options with all defaults applied
 * Used internally by I18n services
 */
export interface ResolvedI18nOptions {
  defaultLocale: string
  fallbackLocale: string
  locales: string[]
  /**
   * Detection resolved at the application root (`/`) — the app's primary mode.
   * For per-path detail (when `detection` is a resolver) use
   * {@link resolveDetectionForPath}.
   */
  detection: ResolvedDetection
}

/** Apply defaults to a single {@link LanguageDetectionOptions}. */
function resolveDetectionOptions(detection: LanguageDetectionOptions | undefined): ResolvedDetection {
  const enabled = detection ? detection.enabled !== false : true
  const strategy: DetectionStrategy = (detection && 'strategy' in detection) ? detection.strategy ?? 'cookie' : 'cookie'
  const prefixDefaultLocale: false | true | 'redirect' =
    (detection && 'prefixDefaultLocale' in detection && detection.prefixDefaultLocale !== undefined)
      ? detection.prefixDefaultLocale
      : false
  const cookieOptions = (detection && 'cookieOptions' in detection) ? detection.cookieOptions : undefined
  return { enabled, strategy, prefixDefaultLocale, cookieOptions }
}

/**
 * Resolve the detection options for a given request path, evaluating the
 * per-path resolver when `detection` is a function.
 */
export function resolveDetectionForPath(detection: DetectionConfig | undefined, path: string): ResolvedDetection {
  return resolveDetectionOptions(typeof detection === 'function' ? detection(path) : detection)
}

/**
 * Resolve I18n options with defaults. `detection` reflects the application root
 * (`/`); use {@link resolveDetectionForPath} for per-path detail.
 */
export function resolveI18nOptions(options?: I18nModuleOptions): ResolvedI18nOptions {
  return {
    defaultLocale: options?.defaultLocale ?? 'en',
    fallbackLocale: options?.fallbackLocale ?? 'en',
    locales: options?.locales ?? ['en'],
    detection: resolveDetectionForPath(options?.detection, '/'),
  }
}

/**
 * Build Hono languageDetector options for a resolved detection + locale config.
 *
 * Cookie strategy persists the detected locale to the `locale` cookie
 * (`caches: ['cookie']`) using the resolved `cookieOptions` — so a per-path
 * cookie area scopes the write (e.g. `{ path: '/admin' }`) instead of writing
 * at the default `Path=/` and leaking across the app. Other strategies don't
 * write any cookie.
 */
export function buildDetectorOptions(
  detection: ResolvedDetection,
  locales: string[],
  defaultLocale: string,
): Partial<DetectorOptions> {
  const detectorOptions: Partial<DetectorOptions> = {
    order: [detection.strategy],
    fallbackLanguage: defaultLocale,
    supportedLanguages: locales,
    lookupCookie: LOCALE_COOKIE,
    lookupQueryString: LOCALE_COOKIE,
    lookupFromPathIndex: 0,
    ignoreCase: true,
  }

  if (detection.strategy === 'cookie') {
    detectorOptions.caches = ['cookie']
    if (detection.cookieOptions) {
      detectorOptions.cookieOptions = detection.cookieOptions
    }
  } else {
    detectorOptions.caches = false
  }

  return detectorOptions
}
