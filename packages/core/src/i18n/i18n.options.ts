/**
 * I18n Module Options
 *
 * Configuration options for the I18n dynamic module.
 * Use with I18nModule.forRoot() to configure locale settings.
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
   * Language detection configuration
   * Controls how the locale is extracted from incoming requests
   */
  detection?: LanguageDetectionOptions
}

/**
 * Resolved options with all defaults applied
 * Used internally by I18n services
 */
export interface ResolvedI18nOptions {
  defaultLocale: string
  fallbackLocale: string
  locales: string[]
  detection: {
    enabled: boolean
    strategy: DetectionStrategy
    /** Resolved value of the path detection `prefixDefaultLocale` option. Only meaningful when `strategy` is `'path'`. */
    prefixDefaultLocale: false | true | 'redirect'
  }
}

/**
 * Resolve I18n options with defaults
 */
export function resolveI18nOptions(options?: I18nModuleOptions): ResolvedI18nOptions {
  const detection = options?.detection
  const enabled = detection ? (detection.enabled !== false) : true
  const strategy: DetectionStrategy = (detection && 'strategy' in detection) ? detection.strategy ?? 'cookie' : 'cookie'
  const prefixDefaultLocale: false | true | 'redirect' =
    (detection && 'prefixDefaultLocale' in detection && detection.prefixDefaultLocale !== undefined)
      ? detection.prefixDefaultLocale
      : false

  return {
    defaultLocale: options?.defaultLocale ?? 'en',
    fallbackLocale: options?.fallbackLocale ?? 'en',
    locales: options?.locales ?? ['en'],
    detection: { enabled, strategy, prefixDefaultLocale },
  }
}

/**
 * Build Hono languageDetector options from I18n module options
 */
export function buildDetectorOptions(options?: I18nModuleOptions): Partial<DetectorOptions> {
  const resolved = resolveI18nOptions(options)
  const strategy = resolved.detection.strategy

  const detectorOptions: Partial<DetectorOptions> = {
    order: [strategy],
    fallbackLanguage: resolved.defaultLocale,
    supportedLanguages: resolved.locales,
    lookupCookie: 'locale',
    lookupQueryString: 'locale',
    lookupFromPathIndex: 0,
    ignoreCase: true,
  }

  if (strategy === 'cookie') {
    detectorOptions.caches = ['cookie']
    if (options?.detection && 'cookieOptions' in options.detection && options.detection.cookieOptions) {
      detectorOptions.cookieOptions = options.detection.cookieOptions
    }
  } else {
    detectorOptions.caches = false
  }

  return detectorOptions
}
