import type { Application } from 'stratal'
import { DI_TOKENS } from 'stratal/di'
import { I18N_TOKENS, type I18nModuleOptions } from 'stratal/i18n'
import { ROUTER_TOKENS, type LocaleUrlService, type TrailingSlashConfig } from 'stratal/router'
import { describe, expect, it } from 'vitest'
import { HreflangService } from '../services/hreflang.service'

/** Shorthand for the `SeoLinkTag` descriptor `buildLinks` now returns. */
function alt(hreflang: string, href: string) {
  return { rel: 'alternate', hreflang, href }
}

interface StubOptions {
  /** Omit to simulate an app that never configured i18n (token unregistered). */
  i18n?: I18nModuleOptions
  /** When provided, simulates path-based locale detection being active. */
  pathConfig?: { allLocales: string[]; defaultLocale: string | null; prefixDefaultLocale: false | true | 'redirect' }
  trailingSlash?: TrailingSlashConfig
}

function createService(stub: StubOptions): HreflangService {
  const pathEnabled = !!stub.pathConfig
  const localeUrl = {
    pathEnabled,
    shouldPrefix: (locale: string) => {
      if (!stub.pathConfig) return true
      if (stub.pathConfig.prefixDefaultLocale === true) return true
      return locale !== stub.pathConfig.defaultLocale
    },
    applyPrefix: (pathname: string, locale: string) => {
      if (!stub.pathConfig) return pathname
      const cfg = stub.pathConfig
      const should = cfg.prefixDefaultLocale === true || locale !== cfg.defaultLocale
      if (!should) return pathname
      return pathname === '/' ? `/${locale}` : `/${locale}${pathname}`
    },
    stripPrefix: (pathname: string) => {
      const locales = stub.pathConfig?.allLocales ?? []
      const segments = pathname.split('/').filter(Boolean)
      if (segments.length > 0 && locales.includes(segments[0])) {
        const rest = segments.slice(1).join('/')
        return rest ? `/${rest}` : '/'
      }
      return pathname
    },
  } as unknown as LocaleUrlService

  const application = {
    config: { trailingSlash: stub.trailingSlash },
  } as unknown as Application

  const resolve = (token: symbol) => {
    if (token === I18N_TOKENS.Options) {
      if (!stub.i18n) throw new Error(`No provider for ${String(token)}`)
      return stub.i18n
    }
    if (token === ROUTER_TOKENS.LocaleUrlService) return localeUrl
    if (token === DI_TOKENS.Application) return application
    throw new Error(`Unexpected token: ${String(token)}`)
  }
  const container = {
    resolve,
    tryResolve: (token: symbol) => {
      try {
        return resolve(token)
      } catch {
        return undefined
      }
    },
  }

  // The runtime injects `@inject(CONTAINER_TOKEN)`; in tests we satisfy the
  // constructor signature directly with the stub container shape.
  return new HreflangService(container as never)
}

describe('HreflangService', () => {
  describe('activation guards', () => {
    it('returns [] when i18n is not configured (no Options provider)', () => {
      const service = createService({})
      expect(service.buildLinks(new URL('http://localhost/users'))).toEqual([])
    })

    it('returns [] when only one locale is configured', () => {
      const service = createService({ i18n: { locales: ['en'], defaultLocale: 'en' } })
      expect(service.buildLinks(new URL('http://localhost/users'))).toEqual([])
    })

    it('returns [] for cookie/header strategies (no URL-distinct variants)', () => {
      const service = createService({
        i18n: { locales: ['en', 'fr'], defaultLocale: 'en', detection: { strategy: 'cookie' } },
      })
      expect(service.buildLinks(new URL('http://localhost/users'))).toEqual([])
    })
  })

  describe('path strategy (default unprefixed)', () => {
    const stub: StubOptions = {
      i18n: { locales: ['en', 'fr'], defaultLocale: 'en', detection: { strategy: 'path' } },
      pathConfig: { allLocales: ['en', 'fr'], defaultLocale: 'en', prefixDefaultLocale: false },
    }

    it('emits unprefixed default, prefixed other, and x-default pointing at default', () => {
      const service = createService(stub)
      const links = service.buildLinks(new URL('http://localhost/users'))
      expect(links).toEqual([
        alt('en', 'http://localhost/users'),
        alt('fr', 'http://localhost/fr/users'),
        alt('x-default', 'http://localhost/users'),
      ])
    })

    it('strips an existing locale prefix before rebuilding per-locale variants', () => {
      const service = createService(stub)
      const links = service.buildLinks(new URL('http://localhost/fr/users/123'))
      expect(links).toEqual([
        alt('en', 'http://localhost/users/123'),
        alt('fr', 'http://localhost/fr/users/123'),
        alt('x-default', 'http://localhost/users/123'),
      ])
    })

    it('preserves the search string on every variant', () => {
      const service = createService(stub)
      const links = service.buildLinks(new URL('http://localhost/users?page=2&sort=name'))
      for (const link of links) {
        expect(link.href).toContain('?page=2&sort=name')
      }
    })
  })

  describe('path strategy (all prefixed)', () => {
    const stub: StubOptions = {
      i18n: { locales: ['en', 'fr'], defaultLocale: 'en', detection: { strategy: 'path' } },
      pathConfig: { allLocales: ['en', 'fr'], defaultLocale: null, prefixDefaultLocale: true },
    }

    it('prefixes every locale and points x-default at the default-locale URL', () => {
      const service = createService(stub)
      const links = service.buildLinks(new URL('http://localhost/en/users'))
      expect(links).toEqual([
        alt('en', 'http://localhost/en/users'),
        alt('fr', 'http://localhost/fr/users'),
        alt('x-default', 'http://localhost/en/users'),
      ])
    })
  })

  describe('querystring strategy', () => {
    const stub: StubOptions = {
      i18n: { locales: ['en', 'fr'], defaultLocale: 'en', detection: { strategy: 'querystring' } },
    }

    it('omits locale= for the default locale and adds ?locale= for others', () => {
      const service = createService(stub)
      const links = service.buildLinks(new URL('http://localhost/users'))
      expect(links).toEqual([
        alt('en', 'http://localhost/users'),
        alt('fr', 'http://localhost/users?locale=fr'),
        alt('x-default', 'http://localhost/users'),
      ])
    })

    it('strips an existing locale= and preserves other query params', () => {
      const service = createService(stub)
      const links = service.buildLinks(new URL('http://localhost/users?locale=fr&page=2'))
      expect(links).toEqual([
        alt('en', 'http://localhost/users?page=2'),
        alt('fr', 'http://localhost/users?page=2&locale=fr'),
        alt('x-default', 'http://localhost/users?page=2'),
      ])
    })
  })

  describe('trailing-slash mode', () => {
    const base: StubOptions = {
      i18n: { locales: ['en', 'fr'], defaultLocale: 'en', detection: { strategy: 'path' } },
      pathConfig: { allLocales: ['en', 'fr'], defaultLocale: 'en', prefixDefaultLocale: false },
    }

    it("applies 'always' to every href", () => {
      const service = createService({ ...base, trailingSlash: 'always' })
      const links = service.buildLinks(new URL('http://localhost/users'))
      expect(links).toEqual([
        alt('en', 'http://localhost/users/'),
        alt('fr', 'http://localhost/fr/users/'),
        alt('x-default', 'http://localhost/users/'),
      ])
    })

    it("applies 'never' to every href", () => {
      const service = createService({ ...base, trailingSlash: 'never' })
      const links = service.buildLinks(new URL('http://localhost/users/'))
      expect(links).toEqual([
        alt('en', 'http://localhost/users'),
        alt('fr', 'http://localhost/fr/users'),
        alt('x-default', 'http://localhost/users'),
      ])
    })

    it("'ignore' leaves URLs untouched", () => {
      const service = createService({ ...base, trailingSlash: 'ignore' })
      const links = service.buildLinks(new URL('http://localhost/users'))
      expect(links[0]).toEqual(alt('en', 'http://localhost/users'))
    })

    it('exempts excluded paths — including locale-prefixed variants', () => {
      const service = createService({ ...base, trailingSlash: { mode: 'always', exclude: ['/users'] } })
      const links = service.buildLinks(new URL('http://localhost/users'))
      expect(links).toEqual([
        alt('en', 'http://localhost/users'),
        alt('fr', 'http://localhost/fr/users'),
        alt('x-default', 'http://localhost/users'),
      ])
    })
  })
})
