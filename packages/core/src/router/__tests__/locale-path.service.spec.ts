import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { Container } from '../../di/container'
import type { I18nModuleOptions } from '../../i18n/i18n.options'
import { I18N_TOKENS } from '../../i18n/i18n.tokens'
import type { HonoApp } from '../hono-app'
import { LocalePathService, type ResolvedPath } from '../services/locale-path.service'

/**
 * Build a LocalePathService with a stub container (serving the given i18n
 * options) and a no-op HonoApp — the constructor only calls `honoApp.use(...)`
 * to install detection middleware, which we don't exercise here.
 */
function createService(i18nOptions: I18nModuleOptions | undefined): LocalePathService {
  const container = {
    isRegistered: (token: unknown) => token === I18N_TOKENS.Options && i18nOptions !== undefined,
    resolve: (token: unknown) => (token === I18N_TOKENS.Options ? i18nOptions : undefined),
  } as unknown as Container

  const honoApp = { use: () => honoApp } as unknown as HonoApp

  return new LocalePathService(container, honoApp)
}

const LOCALES = ['en', 'fr', 'sw']

describe('LocalePathService – static path detection', () => {
  const service = createService({
    defaultLocale: 'en',
    locales: LOCALES,
    detection: { strategy: 'path' },
  })

  it('expands a path into primary + locale variant', () => {
    expect(service.resolve('/users')).toEqual([
      { path: '/users', isLocaleVariant: false },
      { path: '/:locale{(?:fr|sw)}/users', isLocaleVariant: true },
    ])
  })

  it('reports the root as path-localized', () => {
    expect(service.enabled).toBe(true)
    expect(service.isPathLocalized('/users')).toBe(true)
  })
})

describe('LocalePathService – per-path detection resolver', () => {
  // Path-localized everywhere except `/admin`, which is cookie-localized.
  const service = createService({
    defaultLocale: 'en',
    locales: LOCALES,
    detection: (path) =>
      path.startsWith('/admin')
        ? { strategy: 'cookie', cookieOptions: { path: '/admin' } }
        : { strategy: 'path' },
  })

  describe('resolve()', () => {
    it('expands a path-localized route into primary + variant', () => {
      expect(service.resolve('/users')).toEqual([
        { path: '/users', isLocaleVariant: false },
        { path: '/:locale{(?:fr|sw)}/users', isLocaleVariant: true },
      ])
    })

    it('serves a cookie-localized route only at its bare path (no variant)', () => {
      expect(service.resolve('/admin')).toEqual([{ path: '/admin', isLocaleVariant: false }])
      expect(service.resolve('/admin/:organizationId/settings')).toEqual([
        { path: '/admin/:organizationId/settings', isLocaleVariant: false },
      ])
    })

    it('does not treat a sibling sharing the prefix string as cookie-localized', () => {
      // `/administrators` does not match `startsWith('/admin')`? It does — so this
      // documents that the resolver owns matching semantics: a `startsWith` check
      // would catch it. The framework just calls the resolver per path.
      const prefixService = createService({
        defaultLocale: 'en',
        locales: LOCALES,
        detection: (path) =>
          path === '/admin' || path.startsWith('/admin/')
            ? { strategy: 'cookie' }
            : { strategy: 'path' },
      })
      expect(prefixService.resolve('/administrators')).toContainEqual({
        path: '/:locale{(?:fr|sw)}/administrators',
        isLocaleVariant: true,
      })
    })
  })

  describe('isPathLocalized()', () => {
    it('is true for path-localized paths and false for cookie-localized ones', () => {
      expect(service.isPathLocalized('/users')).toBe(true)
      expect(service.isPathLocalized('/admin')).toBe(false)
      expect(service.isPathLocalized('/admin/users/1')).toBe(false)
    })
  })

  describe('detectionFor()', () => {
    it('resolves strategy + cookie options per path (drives setLocale)', () => {
      expect(service.detectionFor('/admin/users')).toMatchObject({ strategy: 'cookie', cookieOptions: { path: '/admin' } })
      expect(service.detectionFor('/users')).toMatchObject({ strategy: 'path' })
    })
  })

  describe('global getters reflect the root (primary) mode', () => {
    it('enabled / localePathConfig describe the path-localized root', () => {
      expect(service.enabled).toBe(true)
      expect(service.localePathConfig).toEqual({
        allLocales: LOCALES,
        prefixedLocales: ['fr', 'sw'],
        defaultLocale: 'en',
      })
    })
  })
})

describe('LocalePathService – non-path strategies', () => {
  it('cookie strategy: no variants, not path-localized', () => {
    const service = createService({ defaultLocale: 'en', locales: ['en', 'fr'], detection: { strategy: 'cookie' } })
    expect(service.enabled).toBe(false)
    expect(service.isPathLocalized('/users')).toBe(false)
    expect(service.resolve('/users')).toEqual([{ path: '/users', isLocaleVariant: false }])
  })
})

describe('LocalePathService – multi-locale constraint grouping', () => {
  // Two or more prefixed locales produce an alternation. Hono's RegExpRouter
  // leaks an unparenthesised `|` boundary, so a single-segment locale param
  // (`/:locale{fr|sw}`) would greedily swallow multi-segment paths and shadow
  // the deeper `/:locale{...}/:rest` route. The service groups the alternation
  // (`/:locale{(?:fr|sw)}`) to prevent that.
  const service = createService({ defaultLocale: 'en', locales: ['en', 'fr', 'sw'], detection: { strategy: 'path' } })

  it('wraps the locale alternation in a non-capturing group', () => {
    expect(service.resolve('/')).toEqual([
      { path: '/', isLocaleVariant: false },
      { path: '/:locale{(?:fr|sw)}', isLocaleVariant: true },
    ])
    // A lone prefixed locale is grouped too — an identical no-op group keeps the
    // emitted pattern uniform.
    const single = createService({ defaultLocale: 'en', locales: ['en', 'fr'], detection: { strategy: 'path' } })
    expect(single.resolve('/')).toContainEqual({ path: '/:locale{(?:fr)}', isLocaleVariant: true })
  })

  it('does not let the index locale variant swallow a multi-segment localized URL', async () => {
    // Register the exact patterns the service emits for the home (`/`) and a
    // catch-all page (`/:slug{.+}`) route, in stratal's specificity order
    // (locale variants before their primaries), into a Hono app configured the
    // same way the framework configures it (`strict: false`).
    const index = service.resolve('/')
    const page = service.resolve('/:slug{.+}')
    const variant = (paths: ResolvedPath[]) => paths.find((p) => p.isLocaleVariant)!.path
    const primary = (paths: ResolvedPath[]) => paths.find((p) => !p.isLocaleVariant)!.path

    const app = new Hono({ strict: false })
    app.get(variant(page), (c) => c.text('PAGE_VARIANT'))
    app.get(variant(index), (c) => c.text('INDEX_VARIANT'))
    app.get(primary(page), (c) => c.text('PAGE_PRIMARY'))
    app.get(primary(index), (c) => c.text('INDEX_PRIMARY'))

    const hit = async (path: string) => (await app.request(`http://x${path}`)).text()

    // A localized home stays on the index route…
    expect(await hit('/fr')).toBe('INDEX_VARIANT')
    // …but a deeper localized path must resolve to a page route, never the
    // single-segment index variant (the bug this grouping fixes).
    expect(await hit('/fr/auth/login')).toBe('PAGE_VARIANT')
    expect(await hit('/sw/applications/new')).toBe('PAGE_VARIANT')
  })
})
