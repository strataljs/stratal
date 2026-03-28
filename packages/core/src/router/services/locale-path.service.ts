import { inject } from 'tsyringe'
import { CONTAINER_TOKEN } from '../../di/tokens'
import { Transient } from '../../di/decorators'
import type { Container } from '../../di/container'
import { I18N_TOKENS } from '../../i18n/i18n.tokens'
import type { I18nModuleOptions } from '../../i18n/i18n.options'
import type { LocalePathConfig } from '../types'

/**
 * A resolved path with locale variant metadata.
 */
export interface ResolvedPath {
  /** The fully resolved path (may include /{locale} prefix) */
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
 * Absorbs the locale detection config computation previously in HonoApp constructor.
 *
 * Registered as a singleton in the container.
 */
@Transient()
export class LocalePathService {
  private readonly _config: LocalePathConfig | null
  private readonly _pathDetectionEnabled: boolean
  private readonly _prefixDefaultLocale: false | true | 'redirect'

  constructor(@inject(CONTAINER_TOKEN) container: Container) {
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

    // All locales prefixed (prefixDefaultLocale: true)
    if (this._config.defaultLocale === null) {
      return [{ path: `/{locale}${path}`, isLocaleVariant: true }]
    }

    // Default locale unprefixed, other locales prefixed
    const result: ResolvedPath[] = [{ path, isLocaleVariant: false }]

    // Only add /{locale} route when there are non-default locales to match
    // (z.enum requires at least one value)
    if (this._config.prefixedLocales.length > 0) {
      result.push({ path: `/{locale}${path}`, isLocaleVariant: true })
    }

    return result
  }
}
