import type { Context, MiddlewareHandler } from 'hono'
import { languageDetector } from 'hono/language'
import { inject } from '../../di'
import type { Container } from '../../di/container'
import { Singleton } from '../../di/decorators'
import { CONTAINER_TOKEN } from '../../di/tokens'
import {
  buildDetectorOptions,
  type DetectionConfig,
  type I18nModuleOptions,
  type ResolvedDetection,
  resolveDetectionForPath,
} from '../../i18n/i18n.options'
import { I18N_TOKENS } from '../../i18n/i18n.tokens'
import { ROUTER_CONTEXT_KEYS } from '../constants'
import type { HonoApp } from '../hono-app'
import { ROUTER_TOKENS } from '../router.tokens'
import type { LocalePathConfig, RouterEnv } from '../types'

/**
 * A resolved path with locale variant metadata.
 */
export interface ResolvedPath {
  /** The fully resolved path (may include /:locale prefix) */
  path: string
  /** Whether this path is a locale-prefixed variant */
  isLocaleVariant: boolean
}

/**
 * Resolves locale path variants for route paths.
 *
 * Detection can be static or a per-path resolver (see {@link DetectionConfig}),
 * so this evaluates it **per path**: which routes get a `/:locale` variant
 * (at registration) and which detector runs (per request). A path resolving to
 * a non-`path` strategy gets no variant and is localized out-of-band (cookie).
 *
 * Also applies language detection and default-locale redirect middleware to
 * HonoApp when resolved from the container. Registered as a singleton.
 */
@Singleton()
export class LocalePathService {
  private readonly _locales: string[]
  private readonly _defaultLocale: string
  private readonly _detection: DetectionConfig | undefined
  /** Detection + config resolved at the application root (`/`) — the primary mode. */
  private readonly _primary: ResolvedDetection
  private readonly _primaryConfig: LocalePathConfig | null

  constructor(
    @inject(CONTAINER_TOKEN) container: Container,
    @inject(ROUTER_TOKENS.HonoApp) private readonly honoApp: HonoApp,
  ) {
    const i18nOptions = container.isRegistered(I18N_TOKENS.Options)
      ? container.resolve<I18nModuleOptions>(I18N_TOKENS.Options)
      : undefined

    this._locales = i18nOptions?.locales ?? ['en']
    this._defaultLocale = i18nOptions?.defaultLocale ?? 'en'
    this._detection = i18nOptions?.detection
    this._primary = resolveDetectionForPath(this._detection, '/')
    this._primaryConfig = this.buildConfig(this._primary)

    // Install detection: always when `detection` is a resolver (it decides
    // per request), otherwise only when the static config keeps it enabled.
    if (typeof this._detection === 'function' || this._primary.enabled) {
      this.setupLanguageDetection()
    }
    if (this._primaryConfig?.defaultLocale && this._primary.prefixDefaultLocale === 'redirect') {
      this.setupDefaultLocaleRedirect(this._primaryConfig.defaultLocale)
    }
  }

  /** Whether the app uses path-based locale URLs (resolved at the root). */
  get enabled(): boolean {
    return this._primaryConfig !== null
  }

  /** The primary (root) locale path config, or null if the root isn't path-localized. */
  get localePathConfig(): LocalePathConfig | null {
    return this._primaryConfig
  }

  /** The primary (root) prefixDefaultLocale setting (false, true, or 'redirect'). */
  get prefixDefaultLocale(): false | true | 'redirect' {
    return this._primary.prefixDefaultLocale
  }

  /** Resolve the detection options for a given request path. */
  detectionFor(path: string): ResolvedDetection {
    return resolveDetectionForPath(this._detection, path)
  }

  /**
   * Whether a pathname is path-localized — served with a `/:locale` segment.
   * `false` for paths resolving to a non-`path` strategy (localized by cookie)
   * or with detection disabled. Redirect middleware should skip non-localized
   * paths so it never prepends a locale segment.
   */
  isPathLocalized(pathname: string): boolean {
    return this.buildConfig(this.detectionFor(pathname)) !== null
  }

  /**
   * Expand a path into primary + locale-prefixed variants.
   *
   * @param path - The base route path to expand
   * @returns Array of resolved paths with locale metadata
   */
  resolve(path: string): ResolvedPath[] {
    const config = this.buildConfig(this.detectionFor(path))
    if (!config) {
      // Not path-localized → no `/:locale` variant; served at the bare path.
      return [{ path, isLocaleVariant: false }]
    }

    const constraintLocales = config.defaultLocale === null ? config.allLocales : config.prefixedLocales
    // Wrap the alternation in a non-capturing group. An unparenthesised
    // `:locale{en|fr}` leaks the `|` boundary in Hono's RegExpRouter, so the
    // single-segment locale param greedily swallows multi-segment paths
    // (`/en/foo/bar` matches `/:locale{en|fr}` instead of `/:locale{en|fr}/:rest`).
    // Grouping keeps the alternation a single token; a lone locale (no `|`) is
    // an identical no-op group, so it's grouped too for a uniform pattern.
    const constraint = `{(?:${constraintLocales.join('|')})}`
    const suffix = path === '/' ? '' : path

    // All locales prefixed (prefixDefaultLocale: true)
    if (config.defaultLocale === null) {
      return [{ path: `/:locale${constraint}${suffix}`, isLocaleVariant: true }]
    }

    // Default locale unprefixed, other locales prefixed
    const result: ResolvedPath[] = [{ path, isLocaleVariant: false }]

    // Only add /:locale route when there are non-default locales to match
    // (z.enum requires at least one value)
    if (config.prefixedLocales.length > 0) {
      result.push({ path: `/:locale${constraint}${suffix}`, isLocaleVariant: true })
    }

    return result
  }

  /** Build the locale path config for a resolved detection, or null if not path-localized. */
  private buildConfig(detection: ResolvedDetection): LocalePathConfig | null {
    if (!detection.enabled || detection.strategy !== 'path') return null
    const allLocales = this._locales
    const defaultLocale = this._defaultLocale
    return detection.prefixDefaultLocale === true
      ? { allLocales, prefixedLocales: allLocales, defaultLocale: null }
      : { allLocales, prefixedLocales: allLocales.filter(l => l !== defaultLocale), defaultLocale }
  }

  /**
   * Apply Hono's languageDetector and bridge the detected language to Stratal's
   * LOCALE context variable. With a per-path resolver, the detector is chosen
   * per request (cached by strategy); with a static config, one detector is
   * built up front.
   */
  private setupLanguageDetection(): void {
    const buildDetector = (detection: ResolvedDetection): MiddlewareHandler<RouterEnv> =>
      languageDetector(buildDetectorOptions(detection, this._locales, this._defaultLocale)) as MiddlewareHandler<RouterEnv>

    let detector: MiddlewareHandler<RouterEnv>
    if (typeof this._detection === 'function') {
      const resolver = this._detection
      // Memoize by strategy + cookie write options (which can both differ per
      // path) — a resolver typically returns only a handful of distinct configs.
      const cache = new Map<string, MiddlewareHandler<RouterEnv>>()
      const detectorFor = (detection: ResolvedDetection): MiddlewareHandler<RouterEnv> => {
        const key = `${detection.strategy}:${JSON.stringify(detection.cookieOptions ?? {})}`
        let d = cache.get(key)
        if (!d) {
          d = buildDetector(detection)
          cache.set(key, d)
        }
        return d
      }
      detector = (c, next) => {
        const detection = resolveDetectionForPath(resolver, new URL(c.req.url).pathname)
        if (!detection.enabled) return next()
        return detectorFor(detection)(c, next)
      }
    } else {
      detector = buildDetector(this._primary)
    }

    this.honoApp.use('*', detector)

    // Bridge: sync Hono's 'language' variable to Stratal's LOCALE context key
    this.honoApp.use('*', async (c: Context<RouterEnv>, next: () => Promise<void>) => {
      const language = c.get('language')
      if (language) {
        c.set(ROUTER_CONTEXT_KEYS.LOCALE, language)
      }
      await next()
    })
  }

  /**
   * Redirect requests that include the default locale prefix to the unprefixed path.
   * For example, `/en/users` → 301 redirect to `/users`.
   *
   * Only active when the root `prefixDefaultLocale` is `'redirect'`.
   */
  private setupDefaultLocaleRedirect(defaultLocale: string): void {
    const prefix = `/${defaultLocale}`
    this.honoApp.use('*', async (c: Context<RouterEnv>, next: () => Promise<void>) => {
      const path = new URL(c.req.url).pathname
      if (path === prefix || path.startsWith(`${prefix}/`)) {
        const stripped = path.slice(prefix.length) || '/'
        return c.redirect(stripped, 301)
      }
      await next()
    })
  }
}
