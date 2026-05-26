import type { Context, MiddlewareHandler } from 'hono'
import { languageDetector } from 'hono/language'
import { inject } from '../../di'
import type { Container } from '../../di/container'
import { Transient } from '../../di/decorators'
import { CONTAINER_TOKEN } from '../../di/tokens'
import { buildDetectorOptions, type I18nModuleOptions } from '../../i18n/i18n.options'
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
 * Computes `LocalePathConfig` from `I18nModuleOptions` and provides
 * path expansion for locale-prefixed route variants.
 *
 * Also applies language detection and default locale redirect middleware
 * to HonoApp when resolved from the container.
 *
 * Registered as a singleton in the container.
 */
@Transient()
export class LocalePathService {
  private readonly _config: LocalePathConfig | null
  private readonly _pathDetectionEnabled: boolean
  private readonly _prefixDefaultLocale: false | true | 'redirect'

  constructor(
    @inject(CONTAINER_TOKEN) container: Container,
    @inject(ROUTER_TOKENS.HonoApp) private readonly honoApp: HonoApp,
  ) {
    const i18nOptions = container.isRegistered(I18N_TOKENS.Options)
      ? container.resolve<I18nModuleOptions>(I18N_TOKENS.Options)
      : undefined

    const detection = i18nOptions?.detection
    const detectionEnabled = detection ? detection.enabled !== false : true
    const strategy = (detection && 'strategy' in detection && detection.strategy) ?? 'cookie'

    this._pathDetectionEnabled = detectionEnabled && strategy === 'path'
    this._prefixDefaultLocale = (detection && 'prefixDefaultLocale' in detection && detection.prefixDefaultLocale !== undefined)
      ? detection.prefixDefaultLocale
      : false

    if (this._pathDetectionEnabled) {
      const allLocales = i18nOptions?.locales ?? ['en']
      const defaultLocale = i18nOptions?.defaultLocale ?? 'en'

      this._config = this._prefixDefaultLocale === true
        ? { allLocales, prefixedLocales: allLocales, defaultLocale: null }
        : { allLocales, prefixedLocales: allLocales.filter(l => l !== defaultLocale), defaultLocale }
    } else {
      this._config = null
    }

    // Apply locale middleware to HonoApp
    if (detectionEnabled) {
      this.setupLanguageDetection(i18nOptions)
    }
    if (this._config?.defaultLocale && this._prefixDefaultLocale === 'redirect') {
      this.setupDefaultLocaleRedirect(this._config.defaultLocale)
    }
  }

  /** Whether path-based locale detection is enabled */
  get enabled(): boolean {
    return this._pathDetectionEnabled
  }

  /** The computed locale path config, or null if path detection is disabled */
  get localePathConfig(): LocalePathConfig | null {
    return this._config
  }

  /** The prefixDefaultLocale setting (false, true, or 'redirect') */
  get prefixDefaultLocale(): false | true | 'redirect' {
    return this._prefixDefaultLocale
  }

  /**
   * Expand a path into primary + locale-prefixed variants.
   *
   * @param path - The base path to expand
   * @returns Array of resolved paths with locale metadata
   */
  resolve(path: string): ResolvedPath[] {
    if (!this._config) {
      return [{ path, isLocaleVariant: false }]
    }

    const constraint = this.buildLocaleConstraint()
    const suffix = path === '/' ? '' : path

    // All locales prefixed (prefixDefaultLocale: true)
    if (this._config.defaultLocale === null) {
      return [{ path: `/:locale${constraint}${suffix}`, isLocaleVariant: true }]
    }

    // Default locale unprefixed, other locales prefixed
    const result: ResolvedPath[] = [{ path, isLocaleVariant: false }]

    // Only add /:locale route when there are non-default locales to match
    // (z.enum requires at least one value)
    if (this._config.prefixedLocales.length > 0) {
      result.push({ path: `/:locale${constraint}${suffix}`, isLocaleVariant: true })
    }

    return result
  }

  /**
   * Build a Hono regex constraint from prefixed locales.
   * e.g., `{en|de|fr}` — restricts `:locale` to only match known values.
   */
  private buildLocaleConstraint(): string {
    const locales = this._config!.defaultLocale === null
      ? this._config!.allLocales
      : this._config!.prefixedLocales
    return `{${locales.join('|')}}`
  }

  /**
   * Apply Hono's languageDetector middleware and bridge the detected language
   * to Stratal's LOCALE context variable.
   */
  private setupLanguageDetection(i18nOptions?: I18nModuleOptions): void {
    const detectorOptions = buildDetectorOptions(i18nOptions)

    // Apply Hono's languageDetector
    this.honoApp.use('*', languageDetector(detectorOptions) as MiddlewareHandler<RouterEnv>)

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
   * Only active when `prefixDefaultLocale` is `'redirect'`.
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
