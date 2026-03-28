import { describe, expect, it, beforeEach } from 'vitest'
import { RouteRegistry, type RegisteredRoute } from '../route-registry'

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

describe('RouteRegistry', () => {
  let registry: RouteRegistry

  beforeEach(() => {
    registry = new RouteRegistry()
  })

  describe('register', () => {
    it('should register a named route', () => {
      registry.register(createRoute({ name: 'users.index' }))
      expect(registry.has('users.index')).toBe(true)
    })

    it('should register an unnamed route', () => {
      registry.register(createRoute())
      expect(registry.all()).toHaveLength(1)
    })

    it('should throw on duplicate named routes', () => {
      registry.register(createRoute({ name: 'users.index' }))
      expect(() =>
        registry.register(createRoute({ name: 'users.index', controller: 'OtherController', action: 'list' }))
      ).toThrow("Duplicate route name 'users.index'")
    })

    it('should allow multiple unnamed routes', () => {
      registry.register(createRoute())
      registry.register(createRoute({ path: '/posts', controller: 'PostsController' }))
      expect(registry.all()).toHaveLength(2)
    })
  })

  describe('get', () => {
    it('should return a named route', () => {
      registry.register(createRoute({ name: 'users.index' }))
      expect(registry.get('users.index')).toMatchObject({ name: 'users.index' })
    })

    it('should return undefined for unknown name', () => {
      expect(registry.get('nonexistent')).toBeUndefined()
    })
  })

  describe('has', () => {
    it('should return true for existing named route', () => {
      registry.register(createRoute({ name: 'users.index' }))
      expect(registry.has('users.index')).toBe(true)
    })

    it('should return false for unknown name', () => {
      expect(registry.has('nonexistent')).toBe(false)
    })
  })

  describe('all', () => {
    it('should return all routes sorted by specificity', () => {
      registry.register(createRoute({ path: '/users/:id', paramNames: ['id'] }))
      registry.register(createRoute({ path: '/users/create' }))
      registry.register(createRoute({ path: '/{locale}/users/:id', paramNames: ['id'] }))

      const routes = registry.all()
      expect(routes.map(r => r.path)).toEqual([
        '/users/create',
        '/users/:id',
        '/{locale}/users/:id',
      ])
    })

    it('should return empty array when no routes', () => {
      expect(registry.all()).toEqual([])
    })
  })

  describe('named', () => {
    it('should return only named routes', () => {
      registry.register(createRoute({ name: 'users.index' }))
      registry.register(createRoute({ path: '/health' })) // unnamed
      registry.register(createRoute({ name: 'users.show', path: '/users/:id', paramNames: ['id'] }))

      const named = registry.named()
      expect(named).toHaveLength(2)
      expect(named.map(r => r.name)).toEqual(['users.index', 'users.show'])
    })
  })

  describe('url', () => {
    it('should generate URL for simple route', () => {
      registry.register(createRoute({ name: 'users.index', path: '/users' }))
      expect(registry.url('users.index')).toBe('/users')
    })

    it('should fill path params', () => {
      registry.register(createRoute({
        name: 'users.show',
        path: '/users/:id',
        paramNames: ['id'],
      }))
      expect(registry.url('users.show', { id: '42' })).toBe('/users/42')
    })

    it('should fill multiple path params', () => {
      registry.register(createRoute({
        name: 'notes.show',
        path: '/users/:userId/notes/:noteId',
        paramNames: ['userId', 'noteId'],
      }))
      expect(registry.url('notes.show', { userId: '1', noteId: '99' })).toBe('/users/1/notes/99')
    })

    it('should append extra params as query string', () => {
      registry.register(createRoute({
        name: 'users.show',
        path: '/users/:id',
        paramNames: ['id'],
      }))
      expect(registry.url('users.show', { id: '1', search: 'rocket' })).toBe('/users/1?search=rocket')
    })

    it('should handle query string with multiple extras', () => {
      registry.register(createRoute({ name: 'users.index', path: '/users' }))
      const url = registry.url('users.index', { page: '2', limit: '10' })
      expect(url).toContain('/users?')
      expect(url).toContain('page=2')
      expect(url).toContain('limit=10')
    })

    it('should generate domain-prefixed URL', () => {
      registry.register(createRoute({
        name: 'tenant.dashboard',
        path: '/dashboard',
        domain: '{tenant}.myapp.com',
        domainParamNames: ['tenant'],
      }))
      expect(registry.url('tenant.dashboard', { tenant: 'acme' })).toBe('https://acme.myapp.com/dashboard')
    })

    it('should consume domain params from the same params object', () => {
      registry.register(createRoute({
        name: 'tenant.users.show',
        path: '/users/:id',
        paramNames: ['id'],
        domain: '{tenant}.myapp.com',
        domainParamNames: ['tenant'],
      }))
      expect(registry.url('tenant.users.show', { tenant: 'acme', id: '5' })).toBe('https://acme.myapp.com/users/5')
    })

    it('should encode param values', () => {
      registry.register(createRoute({
        name: 'users.show',
        path: '/users/:id',
        paramNames: ['id'],
      }))
      expect(registry.url('users.show', { id: 'hello world' })).toBe('/users/hello%20world')
    })

    it('should throw for unknown route name', () => {
      expect(() => registry.url('nonexistent')).toThrow("Route 'nonexistent' not found")
    })

    it('should throw for missing required path param', () => {
      registry.register(createRoute({
        name: 'users.show',
        path: '/users/:id',
        paramNames: ['id'],
      }))
      expect(() => registry.url('users.show')).toThrow("Missing required param 'id'")
    })

    it('should throw for missing required domain param', () => {
      registry.register(createRoute({
        name: 'tenant.dashboard',
        path: '/dashboard',
        domain: '{tenant}.myapp.com',
        domainParamNames: ['tenant'],
      }))
      expect(() => registry.url('tenant.dashboard')).toThrow("Missing required domain param 'tenant'")
    })
  })

  describe('createRoute', () => {
    it('should auto-extract param names from path', () => {
      const route = RouteRegistry.createRoute({
        name: 'users.show',
        method: 'get',
        path: '/users/:id',
        controller: 'UsersController',
        action: 'show',
        hidden: false,
        middleware: [],
      })
      expect(route.paramNames).toEqual(['id'])
      expect(route.domainParamNames).toEqual([])
    })

    it('should auto-extract domain param names', () => {
      const route = RouteRegistry.createRoute({
        name: 'tenant.dashboard',
        method: 'get',
        path: '/dashboard',
        domain: '{tenant}.myapp.com',
        controller: 'DashboardController',
        action: 'index',
        hidden: false,
        middleware: [],
      })
      expect(route.domainParamNames).toEqual(['tenant'])
    })

    it('should use provided param names if given', () => {
      const route = RouteRegistry.createRoute({
        method: 'get',
        path: '/users/:id',
        paramNames: ['customId'],
        controller: 'UsersController',
        action: 'show',
        hidden: false,
        middleware: [],
      })
      expect(route.paramNames).toEqual(['customId'])
    })
  })
})
