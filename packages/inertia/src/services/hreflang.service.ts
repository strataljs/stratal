import type { Application } from 'stratal'
import { CONTAINER_TOKEN, type Container, DI_TOKENS, Singleton, inject } from 'stratal/di'
import { I18N_TOKENS } from 'stratal/i18n'
import type { I18nModuleOptions } from 'stratal/i18n'
import { ROUTER_TOKENS, applyTrailingSlash, type LocaleUrlService, type TrailingSlashMode } from 'stratal/router'

/**
 * Builds `<link rel="alternate" hreflang="…">` tags for the SSR head.
 *
 * Activated when i18n detection produces URL-distinct locale variants:
 * - `path` strategy with ≥2 locales → locale-prefixed pathname variants
 * - `querystring` strategy with ≥2 locales → `?locale=xx` variants
 *
 * Returns `[]` for cookie/header strategies (no URL distinction) and for
 * single-locale apps. Emits an additional `x-default` link pointing at the
 * default-locale URL.
 *
 * Every generated `href` runs through {@link applyTrailingSlash} with the
 * app-wide mode so hreflang URLs match the canonical form the rest of the
 * router emits.
 */
@Singleton()
export class HreflangService {
  constructor(
    @inject(CONTAINER_TOKEN) private readonly container: Container,
  ) { }

  buildLinks(currentUrl: URL): string[] {
    const i18n = this.container.tryResolve<I18nModuleOptions>(I18N_TOKENS.Options)
    if (!i18n) return []
    const locales = i18n.locales ?? ['en']
    if (locales.length < 2) return []
    const defaultLocale = i18n.defaultLocale ?? 'en'

    const app = this.container.resolve<Application>(DI_TOKENS.Application)
    const trailingSlash: TrailingSlashMode = app.config.trailingSlash ?? 'ignore'

    const localeUrl = this.container.resolve<LocaleUrlService>(ROUTER_TOKENS.LocaleUrlService)
    if (localeUrl.pathEnabled) {
      return this.buildPathLinks(currentUrl, locales, defaultLocale, localeUrl, trailingSlash)
    }

    const strategy = (i18n.detection && 'strategy' in i18n.detection) ? i18n.detection.strategy : undefined
    if (strategy === 'querystring') {
      return this.buildQuerystringLinks(currentUrl, locales, defaultLocale, trailingSlash)
    }

    return []
  }

  private buildPathLinks(
    url: URL,
    locales: string[],
    defaultLocale: string,
    localeUrl: LocaleUrlService,
    trailingSlash: TrailingSlashMode,
  ): string[] {
    const basePath = localeUrl.stripPrefix(url.pathname)
    const links = locales.map((locale) =>
      this.linkTag(locale, this.compose(url, localeUrl.applyPrefix(basePath, locale), url.search, trailingSlash)),
    )
    links.push(this.linkTag('x-default', this.compose(url, localeUrl.applyPrefix(basePath, defaultLocale), url.search, trailingSlash)))
    return links
  }

  private buildQuerystringLinks(
    url: URL,
    locales: string[],
    defaultLocale: string,
    trailingSlash: TrailingSlashMode,
  ): string[] {
    const params = new URLSearchParams(url.search)
    params.delete('locale')
    const baseQs = params.toString()
    const links = locales.map((locale) => {
      const qs = this.composeQuery(baseQs, locale === defaultLocale ? null : ['locale', locale])
      return this.linkTag(locale, this.compose(url, url.pathname, qs, trailingSlash))
    })
    const xDefaultQs = baseQs ? `?${baseQs}` : ''
    links.push(this.linkTag('x-default', this.compose(url, url.pathname, xDefaultQs, trailingSlash)))
    return links
  }

  private compose(url: URL, pathname: string, search: string, mode: TrailingSlashMode): string {
    return applyTrailingSlash(url.origin + pathname + search, mode)
  }

  private composeQuery(baseQs: string, extra: [string, string] | null): string {
    if (!extra) return baseQs ? `?${baseQs}` : ''
    const tail = `${extra[0]}=${encodeURIComponent(extra[1])}`
    return baseQs ? `?${baseQs}&${tail}` : `?${tail}`
  }

  private linkTag(hreflang: string, href: string): string {
    return `<link rel="alternate" hreflang="${hreflang}" href="${href}" />`
  }
}
