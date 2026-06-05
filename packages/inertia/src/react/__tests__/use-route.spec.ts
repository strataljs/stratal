import { describe, expect, it } from 'vitest'
import type { CurrentRoute, SerializedRoutes } from 'stratal/router'
import { applyTrailingSlash, matchCurrent, resolveUrl } from '../use-route'

describe('applyTrailingSlash', () => {
  describe("'ignore'", () => {
    it('returns url as-is', () => {
      expect(applyTrailingSlash('/users', 'ignore')).toBe('/users')
      expect(applyTrailingSlash('/users/', 'ignore')).toBe('/users/')
      expect(applyTrailingSlash('/users?page=2', 'ignore')).toBe('/users?page=2')
    })
  })

  describe("'always'", () => {
    it('appends trailing slash to a relative path', () => {
      expect(applyTrailingSlash('/users', 'always')).toBe('/users/')
    })

    it('keeps trailing slash before query string', () => {
      expect(applyTrailingSlash('/users?page=2', 'always')).toBe('/users/?page=2')
    })

    it('keeps trailing slash before hash', () => {
      expect(applyTrailingSlash('/users#top', 'always')).toBe('/users/#top')
    })

    it('canonicalises absolute URLs (domain routes)', () => {
      expect(applyTrailingSlash('https://acme.app.com/dashboard', 'always'))
        .toBe('https://acme.app.com/dashboard/')
    })

    it('skips file-like paths (last segment with `.`)', () => {
      expect(applyTrailingSlash('/file.json', 'always')).toBe('/file.json')
      expect(applyTrailingSlash('/api/openapi.json', 'always')).toBe('/api/openapi.json')
    })

    it('skips the root path', () => {
      expect(applyTrailingSlash('/', 'always')).toBe('/')
    })

    it('leaves an already-trailing path unchanged', () => {
      expect(applyTrailingSlash('/users/', 'always')).toBe('/users/')
    })
  })

  describe("'never'", () => {
    it('strips a trailing slash from a relative path', () => {
      expect(applyTrailingSlash('/users/', 'never')).toBe('/users')
    })

    it('preserves query string', () => {
      expect(applyTrailingSlash('/users/?page=2', 'never')).toBe('/users?page=2')
    })

    it('canonicalises absolute URLs', () => {
      expect(applyTrailingSlash('https://acme.app.com/dashboard/', 'never'))
        .toBe('https://acme.app.com/dashboard')
    })

    it('skips the root path', () => {
      expect(applyTrailingSlash('/', 'never')).toBe('/')
    })

    it('leaves a non-trailing path unchanged', () => {
      expect(applyTrailingSlash('/users', 'never')).toBe('/users')
    })
  })
})

const routes: SerializedRoutes = {
  'users.index': {
    path: '/users',
    paramNames: [],
    domainParamNames: [],
  },
  'users.show': {
    path: '/users/:id',
    paramNames: ['id'],
    domainParamNames: [],
  },
  'company.users.show': {
    path: '/:companyId/users/:id',
    paramNames: ['companyId', 'id'],
    domainParamNames: [],
  },
  'billing': {
    path: '/billing',
    paramNames: [],
    domainParamNames: [],
  },
  'localized.posts.show': {
    path: '/posts/:id',
    paramNames: ['id'],
    domainParamNames: [],
    localePaths: ['/:locale{en|de|fr}/posts/:id'],
  },
  'tenant.dashboard': {
    path: '/dashboard',
    paramNames: [],
    domain: '{tenant}.app.com',
    domainParamNames: ['tenant'],
  },
}

const emptyCurrent: CurrentRoute = { name: null, params: {}, defaults: {} }

describe('resolveUrl', () => {
  it('builds a URL from a named route + explicit params', () => {
    expect(resolveUrl('users.show', { id: '42' }, routes, emptyCurrent)).toBe('/users/42')
  })

  it('throws when the route name is not registered', () => {
    expect(() => resolveUrl('nonexistent', undefined, routes, emptyCurrent))
      .toThrow('Route "nonexistent" not found.')
  })

  it('carries current-route params over to a target that declares them', () => {
    const current: CurrentRoute = {
      name: 'company.users.index',
      params: { companyId: 'acme' },
      defaults: {},
    }
    expect(resolveUrl('company.users.show', { id: '42' }, routes, current))
      .toBe('/acme/users/42')
  })

  it('does NOT leak carryover params into a target that does not declare them', () => {
    const current: CurrentRoute = {
      name: 'company.users.show',
      params: { companyId: 'acme', id: '42' },
      defaults: {},
    }
    expect(resolveUrl('billing', undefined, routes, current)).toBe('/billing')
  })

  it('applies sticky defaults when the target declares them', () => {
    const current: CurrentRoute = {
      name: 'localized.home',
      params: {},
      defaults: { locale: 'fr' },
    }
    expect(resolveUrl('localized.posts.show', { id: '7' }, routes, current))
      .toBe('/fr/posts/7')
  })

  it('lets explicit params override defaults and carryover', () => {
    const current: CurrentRoute = {
      name: 'localized.posts.show',
      params: { locale: 'fr', id: '1' },
      defaults: { locale: 'de' },
    }
    expect(resolveUrl('localized.posts.show', { locale: 'en', id: '2' }, routes, current))
      .toBe('/en/posts/2')
  })

  it('carries domain params over when the target declares them', () => {
    const current: CurrentRoute = {
      name: 'tenant.dashboard',
      params: { tenant: 'acme' },
      defaults: {},
    }
    expect(resolveUrl('tenant.dashboard', undefined, routes, current))
      .toBe('https://acme.app.com/dashboard')
  })

  it('respects the trailingSlash mode', () => {
    expect(resolveUrl('users.show', { id: '42' }, routes, emptyCurrent, 'always'))
      .toBe('/users/42/')
    expect(resolveUrl('users.show', { id: '42' }, routes, emptyCurrent, 'never'))
      .toBe('/users/42')
  })

  it('throws when a required path param is missing after merging', () => {
    expect(() => resolveUrl('users.show', undefined, routes, emptyCurrent))
      .toThrow(/Missing required parameter "id"/)
  })
})

describe('matchCurrent', () => {
  it('returns the current route name when called with no args', () => {
    expect(matchCurrent({ name: 'users.show', params: {}, defaults: {} })).toBe('users.show')
  })

  it('returns null when no route is matched', () => {
    expect(matchCurrent(emptyCurrent)).toBeNull()
  })

  it('strict-matches a specific name', () => {
    const cur = { name: 'users.show', params: {}, defaults: {} }
    expect(matchCurrent(cur, 'users.show')).toBe(true)
    expect(matchCurrent(cur, 'users.index')).toBe(false)
  })

  it('supports trailing-`.*` wildcard prefix matching', () => {
    const cur = { name: 'users.show', params: {}, defaults: {} }
    expect(matchCurrent(cur, 'users.*')).toBe(true)
    expect(matchCurrent(cur, 'posts.*')).toBe(false)
  })

  it('returns false for any name when current is null', () => {
    expect(matchCurrent(emptyCurrent, 'users.show')).toBe(false)
    expect(matchCurrent(emptyCurrent, 'users.*')).toBe(false)
  })
})
