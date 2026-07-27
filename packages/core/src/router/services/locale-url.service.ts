import { inject } from '../../di'
import { Singleton } from '../../di/decorators'
import { applyLocalePrefix, shouldPrefixLocale, stripLocalePrefix } from '../locale-url'
import { ROUTER_TOKENS } from '../router.tokens'
import type { LocaleUrlConfig } from '../types'
import { type LocalePathService } from './locale-path.service'

/**
 * DI-friendly wrapper around the pure locale-url helpers.
 *
 * Binds {@link LocalePathService} config so consumers can call `applyPrefix`,
 * `stripPrefix`, and `shouldPrefix` without passing config every time.
 *
 * Useful for canonical URL generation, sitemap builders, redirect middleware,
 * hreflang link emission, and anywhere else a request handler needs to compute
 * locale-aware path variants.
 */
@Singleton()
export class LocaleUrlService {
  constructor(
    @inject(ROUTER_TOKENS.LocalePathService) private readonly localePath: LocalePathService,
  ) { }

  /** Whether path-based locale detection is enabled — i.e., locales have URL-distinct path variants. */
  get pathEnabled(): boolean {
    return this.localePath.enabled
  }

  /** Whether the given locale should get a URL prefix under the current config. */
  shouldPrefix(locale: string): boolean {
    return shouldPrefixLocale(locale, this.toUrlConfig())
  }

  /** Prepend `/{locale}` to a pathname, respecting `prefixDefaultLocale`. */
  applyPrefix(pathname: string, locale: string): string {
    return applyLocalePrefix(pathname, locale, this.toUrlConfig())
  }

  /** Strip a known-locale prefix from the start of a pathname. */
  stripPrefix(pathname: string): string {
    const known = this.localePath.localePathConfig?.allLocales ?? []
    return stripLocalePrefix(pathname, known)
  }

  /**
   * Whether a pathname is path-localized — served with a `/:locale` segment.
   * `false` for paths localized out-of-band (cookie strategy) or with detection
   * disabled. Redirect middleware should skip non-localized paths so it never
   * prepends a locale segment to a path that isn't path-localized.
   */
  isPathLocalized(pathname: string): boolean {
    return this.localePath.isPathLocalized(pathname)
  }

  private toUrlConfig(): LocaleUrlConfig | undefined {
    const config = this.localePath.localePathConfig
    if (!config) return undefined
    return { defaultLocale: config.defaultLocale, prefixDefaultLocale: this.localePath.prefixDefaultLocale }
  }
}
