import { describe, expect, it, beforeEach, vi } from 'vitest'
import { Uri, buildRouteUrl } from '../uri'
import { RouteNameNotFoundError } from '../errors/route-name-not-found.error'
import { MissingRouteParamError } from '../errors/missing-route-param.error'
import type { RegisteredRoute, RouteRegistry } from '../route-registry'
import type { RouterContext } from '../router-context'

const createRoute = (overrides: Partial<RegisteredRoute> = {}): RegisteredRoute => ({
  method: 'get',
  path: '/users',
  paramNames: [],
  domainParamNames: [],
  controller: 'UsersController',
  action: 'index',
  hidden: false,
  middleware: [],
  ...overrides,
})

const createMockRegistry = (routes: Record<string, RegisteredRoute> = {}) => ({
  get: vi.fn((name: string) => routes[name]),
}) as unknown as RouteRegistry

const createMockRouterContext = (overrides: {
  url?: string
  headers?: Record<string, string>
  env?: Record<string, string>
} = {}) => ({
  c: {
    req: {
      url: overrides.url ?? 'https://example.com/current?page=1',
      header: vi.fn((name: string) => (overrides.headers ?? {})[name.toLowerCase()]),
    },
    env: overrides.env ?? { APP_SECRET: 'test-secret' },
  },
}) as unknown as RouterContext

describe('buildRouteUrl', () => {
  it('should build URL for simple route', () => {
    const route = createRoute()
    expect(buildRouteUrl(route, 'users.index')).toBe('/users')
  })

  it('should fill path params', () => {
    const route = createRoute({ path: '/users/:id', paramNames: ['id'] })
    expect(buildRouteUrl(route, 'users.show', { id: '42' })).toBe('/users/42')
  })

  it('should fill multiple path params', () => {
    const route = createRoute({ path: '/users/:userId/notes/:noteId', paramNames: ['userId', 'noteId'] })
    expect(buildRouteUrl(route, 'notes.show', { userId: '1', noteId: '99' })).toBe('/users/1/notes/99')
  })

  it('should append extra params as query string', () => {
    const route = createRoute({ path: '/users/:id', paramNames: ['id'] })
    expect(buildRouteUrl(route, 'users.show', { id: '1', search: 'rocket' })).toBe('/users/1?search=rocket')
  })

  it('should handle query string with multiple extras', () => {
    const route = createRoute()
    const url = buildRouteUrl(route, 'users.index', { page: '2', limit: '10' })
    expect(url).toContain('/users?')
    expect(url).toContain('page=2')
    expect(url).toContain('limit=10')
  })

  it('should generate domain-prefixed URL', () => {
    const route = createRoute({
      path: '/dashboard',
      domain: '{tenant}.myapp.com',
      domainParamNames: ['tenant'],
    })
    expect(buildRouteUrl(route, 'tenant.dashboard', { tenant: 'acme' })).toBe('https://acme.myapp.com/dashboard')
  })

  it('should consume both domain and path params', () => {
    const route = createRoute({
      path: '/users/:id',
      paramNames: ['id'],
      domain: '{tenant}.myapp.com',
      domainParamNames: ['tenant'],
    })
    expect(buildRouteUrl(route, 'tenant.users.show', { tenant: 'acme', id: '5' })).toBe('https://acme.myapp.com/users/5')
  })

  it('should encode param values', () => {
    const route = createRoute({ path: '/users/:id', paramNames: ['id'] })
    expect(buildRouteUrl(route, 'users.show', { id: 'hello world' })).toBe('/users/hello%20world')
  })

  it('should throw MissingRouteParamError for missing path param', () => {
    const route = createRoute({ path: '/users/:id', paramNames: ['id'] })
    expect(() => buildRouteUrl(route, 'users.show')).toThrow(MissingRouteParamError)
  })

  it('should throw MissingRouteParamError for missing domain param', () => {
    const route = createRoute({
      path: '/dashboard',
      domain: '{tenant}.myapp.com',
      domainParamNames: ['tenant'],
    })
    expect(() => buildRouteUrl(route, 'tenant.dashboard')).toThrow(MissingRouteParamError)
  })
})

describe('Uri', () => {
  let uri: Uri
  let mockRegistry: RouteRegistry
  let mockRouterContext: RouterContext

  const setupUri = (
    routes: Record<string, RegisteredRoute> = {},
    contextOverrides: Parameters<typeof createMockRouterContext>[0] = {},
  ) => {
    mockRegistry = createMockRegistry(routes)
    mockRouterContext = createMockRouterContext(contextOverrides)
    uri = new Uri(mockRegistry, mockRouterContext)
  }

  beforeEach(() => {
    setupUri()
  })

  describe('route', () => {
    it('should generate URL for a simple route', () => {
      setupUri({ 'users.index': createRoute() })
      expect(uri.route('users.index')).toBe('/users')
    })

    it('should fill path params', () => {
      setupUri({ 'users.show': createRoute({ path: '/users/:id', paramNames: ['id'] }) })
      expect(uri.route('users.show', { id: '42' })).toBe('/users/42')
    })

    it('should append extra params as query string', () => {
      setupUri({ 'users.show': createRoute({ path: '/users/:id', paramNames: ['id'] }) })
      expect(uri.route('users.show', { id: '1', search: 'rocket' })).toBe('/users/1?search=rocket')
    })

    it('should generate domain-prefixed URL', () => {
      setupUri({
        'tenant.dashboard': createRoute({
          path: '/dashboard',
          domain: '{tenant}.myapp.com',
          domainParamNames: ['tenant'],
        }),
      })
      expect(uri.route('tenant.dashboard', { tenant: 'acme' })).toBe('https://acme.myapp.com/dashboard')
    })

    it('should generate absolute URL when option is set', () => {
      setupUri(
        { 'users.index': createRoute() },
        { url: 'https://example.com/current' },
      )
      expect(uri.route('users.index', undefined, { absolute: true })).toBe('https://example.com/users')
    })

    it('should not double-prefix absolute URL for domain routes', () => {
      setupUri({
        'tenant.dashboard': createRoute({
          path: '/dashboard',
          domain: '{tenant}.myapp.com',
          domainParamNames: ['tenant'],
        }),
      })
      // Domain routes already produce https://... so absolute: true should not double-prefix
      expect(uri.route('tenant.dashboard', { tenant: 'acme' }, { absolute: true }))
        .toBe('https://acme.myapp.com/dashboard')
    })

    it('should throw RouteNameNotFoundError for unknown route', () => {
      setupUri({})
      expect(() => uri.route('nonexistent')).toThrow(RouteNameNotFoundError)
    })

    it('should throw MissingRouteParamError for missing params', () => {
      setupUri({ 'users.show': createRoute({ path: '/users/:id', paramNames: ['id'] }) })
      expect(() => uri.route('users.show')).toThrow(MissingRouteParamError)
    })

    it('should merge defaults into params', () => {
      setupUri({ 'posts.index': createRoute({ path: '/:locale/posts', paramNames: ['locale'] }) })
      uri.defaults({ locale: 'en' })
      expect(uri.route('posts.index')).toBe('/en/posts')
    })

    it('should let explicit params override defaults', () => {
      setupUri({ 'posts.index': createRoute({ path: '/:locale/posts', paramNames: ['locale'] }) })
      uri.defaults({ locale: 'en' })
      expect(uri.route('posts.index', { locale: 'fr' })).toBe('/fr/posts')
    })
  })

  describe('signedRoute', () => {
    it('should generate a signed URL with signature param', async () => {
      setupUri(
        { 'users.index': createRoute() },
        { env: { APP_SECRET: 'test-secret' } },
      )
      const url = await uri.signedRoute('users.index')
      expect(url).toContain('/users?')
      expect(url).toContain('signature=')
    })

    it('should include expires param when expiresIn is set', async () => {
      setupUri(
        { 'users.index': createRoute() },
        { env: { APP_SECRET: 'test-secret' } },
      )
      const url = await uri.signedRoute('users.index', undefined, { expiresIn: 3600 })
      expect(url).toContain('expires=')
      expect(url).toContain('signature=')
    })

    it('should throw when APP_SECRET is missing', async () => {
      setupUri(
        { 'users.index': createRoute() },
        { env: {} },
      )
      await expect(uri.signedRoute('users.index')).rejects.toThrow('APP_SECRET')
    })
  })

  describe('temporarySignedRoute', () => {
    it('should generate a signed URL with expiration', async () => {
      setupUri(
        { 'users.index': createRoute() },
        { env: { APP_SECRET: 'test-secret' } },
      )
      const url = await uri.temporarySignedRoute('users.index', 1800)
      expect(url).toContain('expires=')
      expect(url).toContain('signature=')
    })
  })

  describe('hasValidSignature', () => {
    it('should return false when APP_SECRET is missing', async () => {
      setupUri({}, { env: {} })
      expect(await uri.hasValidSignature()).toBe(false)
    })

    it('should return false for unsigned URL', async () => {
      setupUri({}, {
        url: 'https://example.com/users',
        env: { APP_SECRET: 'test-secret' },
      })
      expect(await uri.hasValidSignature()).toBe(false)
    })

    it('should return true for valid signed URL', async () => {
      setupUri(
        { 'users.index': createRoute() },
        { env: { APP_SECRET: 'test-secret' } },
      )
      const signedUrl = await uri.signedRoute('users.index')

      // Create new Uri with the signed URL as the current request URL
      setupUri({}, {
        url: `https://example.com${signedUrl}`,
        env: { APP_SECRET: 'test-secret' },
      })
      expect(await uri.hasValidSignature()).toBe(true)
    })
  })

  describe('current', () => {
    it('should return pathname without query string', () => {
      setupUri({}, { url: 'https://example.com/users?page=1' })
      expect(uri.current()).toBe('/users')
    })

    it('should return pathname when no query string', () => {
      setupUri({}, { url: 'https://example.com/users' })
      expect(uri.current()).toBe('/users')
    })
  })

  describe('full', () => {
    it('should return pathname with query string', () => {
      setupUri({}, { url: 'https://example.com/users?page=1&limit=10' })
      expect(uri.full()).toBe('/users?page=1&limit=10')
    })

    it('should return pathname when no query string', () => {
      setupUri({}, { url: 'https://example.com/users' })
      expect(uri.full()).toBe('/users')
    })
  })

  describe('previous', () => {
    it('should return Referer header value', () => {
      setupUri({}, { headers: { referer: 'https://example.com/previous' } })
      expect(uri.previous()).toBe('https://example.com/previous')
    })

    it('should return default fallback when no Referer', () => {
      setupUri({}, { headers: {} })
      expect(uri.previous()).toBe('/')
    })

    it('should return custom fallback when no Referer', () => {
      setupUri({}, { headers: {} })
      expect(uri.previous('/home')).toBe('/home')
    })
  })

  describe('previousPath', () => {
    it('should return pathname from Referer header', () => {
      setupUri({}, { headers: { referer: 'https://example.com/previous?page=2' } })
      expect(uri.previousPath()).toBe('/previous')
    })

    it('should return default fallback when no Referer', () => {
      setupUri({}, { headers: {} })
      expect(uri.previousPath()).toBe('/')
    })

    it('should return custom fallback when no Referer', () => {
      setupUri({}, { headers: {} })
      expect(uri.previousPath('/home')).toBe('/home')
    })

    it('should return referer as-is if not a valid URL', () => {
      setupUri({}, { headers: { referer: '/relative-path' } })
      expect(uri.previousPath()).toBe('/relative-path')
    })
  })

  describe('to', () => {
    it('should return the path as-is without query params', () => {
      expect(uri.to('/users')).toBe('/users')
    })

    it('should append query params', () => {
      expect(uri.to('/users', { page: '2', limit: '10' })).toBe('/users?page=2&limit=10')
    })

    it('should append to existing query string', () => {
      expect(uri.to('/users?sort=name', { page: '2' })).toBe('/users?sort=name&page=2')
    })

    it('should generate absolute URL when option is set', () => {
      setupUri({}, { url: 'https://example.com/current' })
      expect(uri.to('/users', undefined, { absolute: true })).toBe('https://example.com/users')
    })
  })

  describe('query', () => {
    it('should build URL with query params', () => {
      expect(uri.query('/users', { page: '2' })).toBe('/users?page=2')
    })

    it('should merge with existing query params', () => {
      const result = uri.query('/users?sort=name', { page: '2' })
      expect(result).toContain('sort=name')
      expect(result).toContain('page=2')
    })

    it('should override existing query params', () => {
      const result = uri.query('/users?sort=name', { sort: 'date' })
      expect(result).toBe('/users?sort=date')
    })
  })

  describe('defaults', () => {
    it('should accumulate defaults across multiple calls', () => {
      setupUri({ 'posts.show': createRoute({ path: '/:locale/posts/:id', paramNames: ['locale', 'id'] }) })
      uri.defaults({ locale: 'en' })
      uri.defaults({ id: '1' })
      expect(uri.route('posts.show')).toBe('/en/posts/1')
    })
  })
})
